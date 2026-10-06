//! HTTP genérico (sin CORS) y subida reanudable a YouTube.
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Seek, SeekFrom};
use std::time::Duration;
use tauri::Emitter;

fn client(timeout_s: u64) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(timeout_s))
        .user_agent("ATRIL/2.0 (+https://github.com/GasparRojasDiego/Youtube-Automation)")
        .build()
        .map_err(|e| e.to_string())
}

#[derive(Deserialize)]
pub struct HttpReq {
    method: String,
    url: String,
    #[serde(default)]
    headers: HashMap<String, String>,
    body_text: Option<String>,
    body_b64: Option<String>,
    timeout_s: Option<u64>,
    /// "text" (por defecto) o "base64"
    response: Option<String>,
}

#[derive(Serialize)]
pub struct HttpRes {
    status: u16,
    headers: HashMap<String, String>,
    body: String,
}

#[tauri::command]
pub async fn http_request(req: HttpReq) -> Result<HttpRes, String> {
    let c = client(req.timeout_s.unwrap_or(120))?;
    let method = reqwest::Method::from_bytes(req.method.to_uppercase().as_bytes()).map_err(|e| e.to_string())?;
    let mut rb = c.request(method, &req.url);
    for (k, v) in &req.headers {
        rb = rb.header(k, v);
    }
    if let Some(t) = req.body_text {
        rb = rb.body(t);
    } else if let Some(b) = req.body_b64 {
        rb = rb.body(B64.decode(b).map_err(|e| e.to_string())?);
    }
    let res = rb.send().await.map_err(|e| format!("Error de red ({}): {e}", host_of(&req.url)))?;
    let status = res.status().as_u16();
    let headers = res
        .headers()
        .iter()
        .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
        .collect();
    let bytes = res.bytes().await.map_err(|e| e.to_string())?;
    let body = if req.response.as_deref() == Some("base64") {
        B64.encode(&bytes)
    } else {
        String::from_utf8_lossy(&bytes).to_string()
    };
    Ok(HttpRes { status, headers, body })
}

fn host_of(url: &str) -> String {
    url.split("://").nth(1).and_then(|r| r.split('/').next()).unwrap_or(url).to_string()
}

/// Descarga a disco (imágenes de archivo, miniaturas de referencia, etc.).
#[tauri::command]
pub async fn http_download(url: String, path: String, headers: Option<HashMap<String, String>>) -> Result<u64, String> {
    let c = client(300)?;
    let mut rb = c.get(&url);
    for (k, v) in headers.unwrap_or_default() {
        rb = rb.header(k, v);
    }
    let res = rb.send().await.map_err(|e| format!("Error de red ({}): {e}", host_of(&url)))?;
    if !res.status().is_success() {
        return Err(format!("HTTP {} al descargar {}", res.status().as_u16(), url));
    }
    let bytes = res.bytes().await.map_err(|e| e.to_string())?;
    if let Some(parent) = std::path::Path::new(&path).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let tmp = format!("{path}.part");
    std::fs::write(&tmp, &bytes).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(bytes.len() as u64)
}

#[derive(Serialize, Clone)]
struct UploadProgress {
    id: String,
    sent: u64,
    total: u64,
}

const CHUNK: u64 = 16 * 1024 * 1024; // múltiplo de 256 KiB, como exige la API

/// Subida reanudable (protocolo "resumable" de la YouTube Data API).
/// `session_url`: si se pasa una sesión previa, se intenta reanudar.
/// Devuelve el JSON del recurso `video` creado.
#[tauri::command]
pub async fn youtube_upload(
    app: tauri::AppHandle,
    id: String,
    file_path: String,
    metadata_json: String,
    access_token: String,
    session_url: Option<String>,
) -> Result<String, String> {
    let c = client(600)?;
    let total = std::fs::metadata(&file_path).map_err(|e| e.to_string())?.len();
    let session = match session_url {
        Some(s) if !s.is_empty() => s,
        _ => {
            let res = c
                .post("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status")
                .bearer_auth(&access_token)
                .header("Content-Type", "application/json; charset=UTF-8")
                .header("X-Upload-Content-Length", total.to_string())
                .header("X-Upload-Content-Type", "video/mp4")
                .body(metadata_json.clone())
                .send()
                .await
                .map_err(|e| format!("Error de red al iniciar la subida: {e}"))?;
            if !res.status().is_success() {
                let st = res.status().as_u16();
                let body = res.text().await.unwrap_or_default();
                return Err(format!("HTTP {st} al iniciar la subida: {body}"));
            }
            res.headers()
                .get("location")
                .and_then(|v| v.to_str().ok())
                .ok_or("YouTube no devolvió la URL de sesión de subida")?
                .to_string()
        }
    };
    let _ = app.emit("upload-session", serde_json::json!({ "id": id, "session": session }));

    let mut offset: u64 = query_offset(&c, &session, total).await.unwrap_or(0);
    let mut file = std::fs::File::open(&file_path).map_err(|e| e.to_string())?;
    let mut retries = 0u32;
    loop {
        if offset >= total {
            // Puede ocurrir si ya estaba completa: pedir estado final.
            return match finalize(&c, &session, total).await? {
                Some(json) => Ok(json),
                None => Err("YouTube no confirmó el final de la subida; vuelve a intentarlo.".into()),
            };
        }
        let len = CHUNK.min(total - offset);
        let mut buf = vec![0u8; len as usize];
        file.seek(SeekFrom::Start(offset)).map_err(|e| e.to_string())?;
        file.read_exact(&mut buf).map_err(|e| e.to_string())?;
        let range = format!("bytes {}-{}/{}", offset, offset + len - 1, total);
        let res = c
            .put(&session)
            .header("Content-Length", len.to_string())
            .header("Content-Range", range)
            .body(buf)
            .send()
            .await;
        match res {
            Ok(r) => {
                let st = r.status().as_u16();
                if st == 200 || st == 201 {
                    return r.text().await.map_err(|e| e.to_string());
                } else if st == 308 {
                    offset = r
                        .headers()
                        .get("range")
                        .and_then(|v| v.to_str().ok())
                        .and_then(|s| s.rsplit('-').next())
                        .and_then(|n| n.parse::<u64>().ok())
                        .map(|n| n + 1)
                        .unwrap_or(offset + len);
                    retries = 0;
                    let _ = app.emit("upload-progress", UploadProgress { id: id.clone(), sent: offset, total });
                } else if st == 404 || st == 410 {
                    return Err("La sesión de subida expiró; vuelve a intentarlo (se iniciará una nueva).".into());
                } else if st >= 500 && retries < 6 {
                    retries += 1;
                    tokio::time::sleep(Duration::from_secs(2u64.pow(retries))).await;
                    offset = query_offset(&c, &session, total).await.unwrap_or(offset);
                } else {
                    let body = r.text().await.unwrap_or_default();
                    return Err(format!("HTTP {st} durante la subida: {body}"));
                }
            }
            Err(e) => {
                if retries >= 6 {
                    return Err(format!("La conexión falló repetidamente durante la subida: {e}"));
                }
                retries += 1;
                tokio::time::sleep(Duration::from_secs(2u64.pow(retries))).await;
                if let Some(o) = query_offset(&c, &session, total).await {
                    offset = o;
                }
            }
        }
    }
}

async fn query_offset(c: &reqwest::Client, session: &str, total: u64) -> Option<u64> {
    let r = c
        .put(session)
        .header("Content-Length", "0")
        .header("Content-Range", format!("bytes */{total}"))
        .send()
        .await
        .ok()?;
    if r.status().as_u16() == 308 {
        Some(
            r.headers()
                .get("range")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.rsplit('-').next())
                .and_then(|n| n.parse::<u64>().ok())
                .map(|n| n + 1)
                .unwrap_or(0),
        )
    } else if r.status().is_success() {
        Some(total)
    } else {
        None
    }
}

async fn finalize(c: &reqwest::Client, session: &str, total: u64) -> Result<Option<String>, String> {
    let r = c
        .put(session)
        .header("Content-Length", "0")
        .header("Content-Range", format!("bytes */{total}"))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if r.status().is_success() {
        Ok(Some(r.text().await.map_err(|e| e.to_string())?))
    } else {
        Ok(None)
    }
}
