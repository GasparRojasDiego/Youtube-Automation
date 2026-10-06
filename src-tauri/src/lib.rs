mod db;
mod files;
mod net;
mod proc;

use std::collections::HashMap;
use std::sync::Mutex;
use tauri::Manager;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

const SERVICE: &str = "ATRIL (VT Asvent)";

// ---------- Credenciales: Administrador de credenciales de Windows ----------

#[tauri::command]
fn secret_set(key: String, value: String) -> Result<(), String> {
    let e = keyring::Entry::new(SERVICE, &key).map_err(|e| e.to_string())?;
    e.set_password(&value).map_err(|e| format!("No se pudo guardar la credencial: {e}"))
}

#[tauri::command]
fn secret_get(key: String) -> Result<Option<String>, String> {
    let e = keyring::Entry::new(SERVICE, &key).map_err(|e| e.to_string())?;
    match e.get_password() {
        Ok(v) => Ok(Some(v)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(err) => Err(format!("No se pudo leer la credencial: {err}")),
    }
}

#[tauri::command]
fn secret_delete(key: String) -> Result<(), String> {
    let e = keyring::Entry::new(SERVICE, &key).map_err(|e| e.to_string())?;
    match e.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(err) => Err(err.to_string()),
    }
}

// ---------- OAuth de Google: redirección de bucle local (loopback) ----------

#[derive(Default)]
struct OAuth(Mutex<HashMap<u16, tokio::sync::oneshot::Receiver<HashMap<String, String>>>>);

const OK_PAGE: &str = "<!doctype html><meta charset=utf-8><title>ATRIL</title>\
<body style=\"font-family:Poppins,Segoe UI,sans-serif;background:#1B1B1D;color:#FAFAFA;display:grid;place-items:center;height:100vh;margin:0\">\
<div style=\"text-align:center\"><div style=\"letter-spacing:.35em;font-weight:800;color:#7591FF\">ATRIL</div>\
<p>Listo. Ya puedes cerrar esta pestaña y volver a la app.</p></div>";

fn parse_query(q: &str) -> HashMap<String, String> {
    q.split('&')
        .filter_map(|kv| {
            let mut it = kv.splitn(2, '=');
            let k = it.next()?;
            let v = it.next().unwrap_or("");
            Some((pct_decode(k), pct_decode(v)))
        })
        .collect()
}

fn pct_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => out.push(b' '),
            b'%' if i + 2 < bytes.len() => {
                if let Ok(b) = u8::from_str_radix(&s[i + 1..i + 3], 16) {
                    out.push(b);
                    i += 2;
                } else {
                    out.push(b'%');
                }
            }
            b => out.push(b),
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

/// Abre un puerto local y espera una única redirección de Google.
#[tauri::command]
async fn oauth_listen(state: tauri::State<'_, OAuth>) -> Result<u16, String> {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let (tx, rx) = tokio::sync::oneshot::channel();
    state.0.lock().unwrap().insert(port, rx);
    tokio::spawn(async move {
        let mut tx = Some(tx);
        while let Ok((mut sock, _)) = listener.accept().await {
            let mut buf = vec![0u8; 8192];
            let n = sock.read(&mut buf).await.unwrap_or(0);
            let req = String::from_utf8_lossy(&buf[..n]).to_string();
            let path = req.lines().next().and_then(|l| l.split_whitespace().nth(1)).unwrap_or("/");
            if !path.contains("code=") && !path.contains("error=") {
                let _ = sock.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n").await;
                continue;
            }
            let q = path.split_once('?').map(|x| x.1).unwrap_or("");
            let resp = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                OK_PAGE.len(),
                OK_PAGE
            );
            let _ = sock.write_all(resp.as_bytes()).await;
            if let Some(t) = tx.take() {
                let _ = t.send(parse_query(q));
            }
            break;
        }
    });
    Ok(port)
}

#[tauri::command]
async fn oauth_wait(state: tauri::State<'_, OAuth>, port: u16, timeout_s: u64) -> Result<HashMap<String, String>, String> {
    let rx = state.0.lock().unwrap().remove(&port).ok_or("No hay una espera de autorización activa")?;
    match tokio::time::timeout(std::time::Duration::from_secs(timeout_s), rx).await {
        Ok(Ok(q)) => Ok(q),
        Ok(Err(_)) => Err("La autorización se interrumpió".into()),
        Err(_) => Err("Se agotó el tiempo de espera de la autorización de Google".into()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(proc::Procs::default())
        .manage(proc::Daemons::default())
        .manage(OAuth::default())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let database = db::Db::open(&dir.join("atril.db")).map_err(|e| -> Box<dyn std::error::Error> { e.into() })?;
            app.manage(database);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            db::db_execute,
            db::db_query,
            db::db_batch,
            db::db_script,
            files::fs_read_text,
            files::fs_write_text,
            files::fs_write_b64,
            files::fs_read_b64,
            files::fs_exists,
            files::fs_mkdir,
            files::fs_remove,
            files::fs_copy,
            files::fs_list,
            files::fs_size,
            files::disk_free,
            files::app_paths,
            net::http_request,
            net::http_download,
            net::youtube_upload,
            proc::proc_run,
            proc::proc_kill,
            proc::which,
            proc::proc_spawn,
            proc::proc_stop,
            secret_set,
            secret_get,
            secret_delete,
            oauth_listen,
            oauth_wait,
        ])
        .run(tauri::generate_context!())
        .expect("error al iniciar ATRIL");
}
