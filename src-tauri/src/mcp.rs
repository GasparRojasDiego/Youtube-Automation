// Servidor MCP local de ATRIL: HTTP en 127.0.0.1 (transporte Streamable HTTP con respuestas JSON).
// Cada mensaje JSON-RPC se reenvía a la interfaz, donde vive la lógica de ATRIL, y se devuelve su
// respuesta tal cual. Protecciones: solo escucha en 127.0.0.1, exige el token (Authorization:
// Bearer), rechaza Host ajenos (DNS rebinding) y cualquier petición con Origin (navegadores).
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{Emitter, Manager};
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::sync::oneshot;

const MAX_BODY: usize = 16 * 1024 * 1024;
/// Las herramientas largas (videos, importaciones) responden enseguida y siguen en segundo plano.
const REPLY_TIMEOUT: Duration = Duration::from_secs(300);
const HEAD_TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Default)]
pub struct Mcp {
    port: Mutex<Option<u16>>,
    token: Mutex<String>,
    pending: Mutex<HashMap<u64, oneshot::Sender<(u16, String)>>>,
    next: AtomicU64,
    task: Mutex<Option<tauri::async_runtime::JoinHandle<()>>>,
}

#[derive(Clone, serde::Serialize)]
struct McpRequest {
    key: u64,
    body: String,
    headers: HashMap<String, String>,
}

#[derive(Debug, PartialEq)]
pub struct Head {
    pub method: String,
    pub path: String,
    pub headers: HashMap<String, String>,
}

/// Interpreta la línea de petición y las cabeceras (nombres en minúsculas).
pub fn parse_head(text: &str) -> Option<Head> {
    let mut lines = text.split("\r\n");
    let mut first = lines.next()?.split_whitespace();
    let method = first.next()?.to_uppercase();
    let path = first.next()?.split('?').next().unwrap_or("/").to_string();
    let mut headers = HashMap::new();
    for l in lines {
        if l.is_empty() {
            break;
        }
        if let Some((k, v)) = l.split_once(':') {
            headers.insert(k.trim().to_ascii_lowercase(), v.trim().to_string());
        }
    }
    Some(Head { method, path, headers })
}

fn ct_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

/// Qué hacer con la petición antes de reenviarla: `Ok` o el código HTTP y el motivo.
pub fn check(h: &Head, port: u16, token: &str) -> Result<(), (u16, &'static str)> {
    let host = h.headers.get("host").map(String::as_str).unwrap_or("");
    let local = [format!("127.0.0.1:{port}"), format!("localhost:{port}"), "127.0.0.1".into(), "localhost".into()];
    if !local.iter().any(|x| x == host) {
        return Err((403, "Host no permitido"));
    }
    if h.headers.get("origin").is_some_and(|o| !o.is_empty()) {
        return Err((403, "Origen no permitido: el servidor MCP de ATRIL no atiende a páginas web"));
    }
    if h.path != "/mcp" {
        return Err((404, "Ruta desconocida: usa /mcp"));
    }
    if h.method != "POST" {
        return Err((405, "Solo POST: este servidor no abre flujos SSE por GET"));
    }
    let auth = h.headers.get("authorization").map(String::as_str).unwrap_or("");
    if token.is_empty() || !ct_eq(auth.as_bytes(), format!("Bearer {token}").as_bytes()) {
        return Err((401, "Token inválido: vuelve a conectar desde ATRIL → Ajustes → Claude (MCP)"));
    }
    Ok(())
}

fn reason(status: u16) -> &'static str {
    match status {
        200 => "OK",
        202 => "Accepted",
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        405 => "Method Not Allowed",
        413 => "Payload Too Large",
        503 => "Service Unavailable",
        504 => "Gateway Timeout",
        _ => "Internal Server Error",
    }
}

async fn respond<W: AsyncWriteExt + Unpin>(w: &mut W, status: u16, body: &str) {
    let mut head = format!("HTTP/1.1 {status} {}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n", reason(status), body.len());
    if !body.is_empty() {
        head.push_str("Content-Type: application/json\r\n");
    }
    if status == 405 {
        head.push_str("Allow: POST\r\n");
    }
    if status == 401 {
        head.push_str("WWW-Authenticate: Bearer realm=\"atril\"\r\n");
    }
    head.push_str("\r\n");
    let _ = w.write_all(head.as_bytes()).await;
    let _ = w.write_all(body.as_bytes()).await;
    let _ = w.flush().await;
}

fn error_body(msg: &str) -> String {
    serde_json::json!({ "jsonrpc": "2.0", "id": null, "error": { "code": -32000, "message": msg } }).to_string()
}

/// Lee el cuerpo: con Content-Length o por trozos (chunked).
async fn read_body<R: AsyncBufReadExt + Unpin>(r: &mut R, h: &Head) -> Result<Vec<u8>, u16> {
    let chunked = h.headers.get("transfer-encoding").is_some_and(|v| v.to_ascii_lowercase().contains("chunked"));
    if !chunked {
        let len: usize = h.headers.get("content-length").and_then(|v| v.parse().ok()).unwrap_or(0);
        if len > MAX_BODY {
            return Err(413);
        }
        let mut body = vec![0u8; len];
        r.read_exact(&mut body).await.map_err(|_| 400u16)?;
        return Ok(body);
    }
    let mut body = Vec::new();
    loop {
        let mut line = String::new();
        r.read_line(&mut line).await.map_err(|_| 400u16)?;
        let size = usize::from_str_radix(line.trim().split(';').next().unwrap_or(""), 16).map_err(|_| 400u16)?;
        if size == 0 {
            let mut end = String::new();
            let _ = r.read_line(&mut end).await;
            break;
        }
        if body.len() + size > MAX_BODY {
            return Err(413);
        }
        let mut chunk = vec![0u8; size + 2];
        r.read_exact(&mut chunk).await.map_err(|_| 400u16)?;
        body.extend_from_slice(&chunk[..size]);
    }
    Ok(body)
}

async fn serve(app: tauri::AppHandle, sock: tokio::net::TcpStream) {
    let (rd, mut wr) = sock.into_split();
    let mut r = BufReader::new(rd);
    // Cabeceras (hasta la línea vacía), con tiempo máximo
    let head_text = match tokio::time::timeout(HEAD_TIMEOUT, async {
        let mut text = String::new();
        loop {
            let mut line = String::new();
            let n = r.read_line(&mut line).await.ok()?;
            if n == 0 || text.len() > 64 * 1024 {
                return None;
            }
            text.push_str(&line);
            if line == "\r\n" || line == "\n" {
                return Some(text);
            }
        }
    })
    .await
    {
        Ok(Some(t)) => t.replace("\r\n", "\n").replace('\n', "\r\n"),
        _ => return,
    };
    let Some(head) = parse_head(&head_text) else {
        respond(&mut wr, 400, "").await;
        return;
    };
    let state = app.state::<Mcp>();
    let port = state.port.lock().unwrap().unwrap_or(0);
    let token = state.token.lock().unwrap().clone();
    if let Err((status, msg)) = check(&head, port, &token) {
        respond(&mut wr, status, &error_body(msg)).await;
        return;
    }
    if head.headers.get("expect").is_some_and(|v| v.eq_ignore_ascii_case("100-continue")) {
        let _ = wr.write_all(b"HTTP/1.1 100 Continue\r\n\r\n").await;
    }
    let body = match read_body(&mut r, &head).await {
        Ok(b) => String::from_utf8_lossy(&b).to_string(),
        Err(status) => {
            respond(&mut wr, status, "").await;
            return;
        }
    };
    // Cabeceras que el protocolo necesita (versión y método reflejado) y quién llama
    let headers: HashMap<String, String> = head
        .headers
        .iter()
        .filter(|(k, _)| matches!(k.as_str(), "mcp-protocol-version" | "mcp-method" | "mcp-name" | "user-agent"))
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();
    let key = state.next.fetch_add(1, Ordering::Relaxed);
    let (tx, rx) = oneshot::channel();
    state.pending.lock().unwrap().insert(key, tx);
    if app.emit("mcp-request", McpRequest { key, body, headers }).is_err() {
        state.pending.lock().unwrap().remove(&key);
        respond(&mut wr, 503, &error_body("ATRIL no está listo")).await;
        return;
    }
    match tokio::time::timeout(REPLY_TIMEOUT, rx).await {
        Ok(Ok((status, body))) => respond(&mut wr, status, &body).await,
        _ => {
            state.pending.lock().unwrap().remove(&key);
            respond(&mut wr, 504, &error_body("ATRIL tardó demasiado en responder")).await;
        }
    }
}

/// Abre el servidor (si ya está abierto, solo actualiza el token). Si el puerto está ocupado, prueba
/// los nueve siguientes y, si no, uno libre cualquiera. Devuelve el puerto en uso.
#[tauri::command]
pub async fn mcp_start(app: tauri::AppHandle, port: u16, token: String) -> Result<u16, String> {
    let state = app.state::<Mcp>();
    *state.token.lock().unwrap() = token;
    if let Some(p) = *state.port.lock().unwrap() {
        return Ok(p);
    }
    let mut listener = None;
    for p in (0..10u16).map(|i| port.saturating_add(i)).chain(std::iter::once(0)) {
        if let Ok(l) = tokio::net::TcpListener::bind(("127.0.0.1", p)).await {
            listener = Some(l);
            break;
        }
    }
    let listener = listener.ok_or("No se pudo abrir el servidor MCP en 127.0.0.1")?;
    let bound = listener.local_addr().map_err(|e| e.to_string())?.port();
    *state.port.lock().unwrap() = Some(bound);
    let handle = app.clone();
    let task = tauri::async_runtime::spawn(async move {
        while let Ok((sock, _)) = listener.accept().await {
            tauri::async_runtime::spawn(serve(handle.clone(), sock));
        }
    });
    *state.task.lock().unwrap() = Some(task);
    Ok(bound)
}

#[tauri::command]
pub fn mcp_stop(state: tauri::State<'_, Mcp>) {
    if let Some(t) = state.task.lock().unwrap().take() {
        t.abort();
    }
    *state.port.lock().unwrap() = None;
    for (_, tx) in state.pending.lock().unwrap().drain() {
        let _ = tx.send((503, error_body("Servidor MCP detenido")));
    }
}

#[tauri::command]
pub fn mcp_reply(state: tauri::State<'_, Mcp>, key: u64, status: u16, body: String) {
    if let Some(tx) = state.pending.lock().unwrap().remove(&key) {
        let _ = tx.send((status, body));
    }
}

/// Trae la ventana al frente (cuando Claude pide «mostrar» algo en ATRIL).
#[tauri::command]
pub fn mcp_focus(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn head(method: &str, path: &str, extra: &[(&str, &str)]) -> Head {
        let mut text = format!("{method} {path} HTTP/1.1\r\nHost: 127.0.0.1:47821\r\nAuthorization: Bearer secreto\r\n");
        for (k, v) in extra {
            text.push_str(&format!("{k}: {v}\r\n"));
        }
        text.push_str("\r\n");
        parse_head(&text).unwrap()
    }

    #[test]
    fn acepta_solo_lo_local_y_con_token() {
        assert_eq!(check(&head("POST", "/mcp", &[]), 47821, "secreto"), Ok(()));
        assert_eq!(check(&head("POST", "/mcp?x=1", &[]), 47821, "secreto"), Ok(()));
        assert_eq!(check(&head("POST", "/mcp", &[]), 47821, "otro").unwrap_err().0, 401);
        assert_eq!(check(&head("POST", "/mcp", &[]), 47821, "").unwrap_err().0, 401);
        assert_eq!(check(&head("GET", "/mcp", &[]), 47821, "secreto").unwrap_err().0, 405);
        assert_eq!(check(&head("DELETE", "/mcp", &[]), 47821, "secreto").unwrap_err().0, 405);
        assert_eq!(check(&head("POST", "/otra", &[]), 47821, "secreto").unwrap_err().0, 404);
        // Navegadores (DNS rebinding o una página maliciosa): fuera, aunque traigan el token
        assert_eq!(check(&head("POST", "/mcp", &[("Origin", "https://evil.example")]), 47821, "secreto").unwrap_err().0, 403);
        let mut h = head("POST", "/mcp", &[]);
        h.headers.insert("host".into(), "evil.example:47821".into());
        assert_eq!(check(&h, 47821, "secreto").unwrap_err().0, 403);
    }

    #[test]
    fn lee_cabeceras_en_minusculas() {
        let h = head("post", "/mcp", &[("MCP-Protocol-Version", "2026-07-28"), ("Mcp-Method", "tools/call")]);
        assert_eq!(h.method, "POST");
        assert_eq!(h.headers.get("mcp-protocol-version").unwrap(), "2026-07-28");
        assert_eq!(h.headers.get("mcp-method").unwrap(), "tools/call");
    }

    #[tokio::test]
    async fn cuerpo_con_longitud_y_por_trozos() {
        let h = Head { method: "POST".into(), path: "/mcp".into(), headers: HashMap::from([("content-length".into(), "5".into())]) };
        let mut r = BufReader::new(&b"hola!resto"[..]);
        assert_eq!(read_body(&mut r, &h).await.unwrap(), b"hola!");
        let h = Head { method: "POST".into(), path: "/mcp".into(), headers: HashMap::from([("transfer-encoding".into(), "chunked".into())]) };
        let mut r = BufReader::new(&b"4\r\n{\"a\"\r\n3\r\n:1}\r\n0\r\n\r\n"[..]);
        assert_eq!(read_body(&mut r, &h).await.unwrap(), b"{\"a\":1}");
        let h = Head { method: "POST".into(), path: "/mcp".into(), headers: HashMap::from([("content-length".into(), "999999999".into())]) };
        let mut r = BufReader::new(&b""[..]);
        assert_eq!(read_body(&mut r, &h).await.unwrap_err(), 413);
    }
}
