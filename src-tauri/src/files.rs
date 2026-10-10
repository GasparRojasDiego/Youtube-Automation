//! Operaciones de archivos. App personal: sin ámbitos restringidos, pero
//! todas las escrituras son atómicas (tmp + rename) para no dejar archivos
//! a medias si algo falla.
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::Manager;

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let tmp = path.with_extension(format!(
        "{}.tmp",
        path.extension().and_then(|e| e.to_str()).unwrap_or("")
    ));
    std::fs::write(&tmp, bytes).map_err(|e| format!("No se pudo escribir {}: {e}", tmp.display()))?;
    std::fs::rename(&tmp, path).map_err(|e| format!("No se pudo mover {}: {e}", path.display()))
}

#[tauri::command]
pub fn fs_read_text(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("No se pudo leer {path}: {e}"))
}

#[tauri::command]
pub fn fs_write_text(path: String, contents: String) -> Result<(), String> {
    atomic_write(Path::new(&path), contents.as_bytes())
}

#[tauri::command]
pub fn fs_write_b64(path: String, data: String) -> Result<u64, String> {
    let bytes = B64.decode(data.trim()).map_err(|e| format!("base64 inválido: {e}"))?;
    atomic_write(Path::new(&path), &bytes)?;
    Ok(bytes.len() as u64)
}

#[tauri::command]
pub fn fs_read_b64(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("No se pudo leer {path}: {e}"))?;
    Ok(B64.encode(bytes))
}

#[tauri::command]
pub fn fs_exists(path: String) -> bool {
    Path::new(&path).exists()
}

#[tauri::command]
pub fn fs_mkdir(path: String) -> Result<(), String> {
    std::fs::create_dir_all(&path).map_err(|e| format!("No se pudo crear la carpeta {path}: {e}"))
}

#[tauri::command]
pub fn fs_remove(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.is_dir() {
        std::fs::remove_dir_all(p).map_err(|e| format!("No se pudo borrar {path}: {e}"))
    } else if p.exists() {
        std::fs::remove_file(p).map_err(|e| format!("No se pudo borrar {path}: {e}"))
    } else {
        Ok(())
    }
}

#[tauri::command]
pub fn fs_copy(from: String, to: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&to).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::copy(&from, &to).map(|_| ()).map_err(|e| format!("No se pudo copiar {from} a {to}: {e}"))
}

#[derive(Serialize)]
pub struct Entry {
    name: String,
    path: String,
    is_dir: bool,
    size: u64,
    modified: u64,
}

#[tauri::command]
pub fn fs_list(path: String) -> Result<Vec<Entry>, String> {
    let mut out = Vec::new();
    let rd = match std::fs::read_dir(&path) {
        Ok(r) => r,
        Err(_) => return Ok(out),
    };
    for e in rd.flatten() {
        let md = match e.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };
        let modified = md
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);
        out.push(Entry {
            name: e.file_name().to_string_lossy().to_string(),
            path: e.path().to_string_lossy().to_string(),
            is_dir: md.is_dir(),
            size: md.len(),
            modified,
        });
    }
    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

#[tauri::command]
pub fn fs_size(path: String) -> Result<u64, String> {
    std::fs::metadata(&path).map(|m| m.len()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn disk_free(path: String) -> Result<u64, String> {
    fs2::available_space(&path).map_err(|e| e.to_string())
}

#[derive(Serialize)]
pub struct AppPaths {
    data: String,
    exe_dir: String,
    resources: String,
    home: String,
    documents: String,
    downloads: String,
}

#[tauri::command]
pub fn app_paths(app: tauri::AppHandle) -> Result<AppPaths, String> {
    let data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(PathBuf::from))
        .unwrap_or_default();
    let resources = app.path().resource_dir().unwrap_or_default();
    let home = app.path().home_dir().unwrap_or_default();
    let documents = app.path().document_dir().unwrap_or_else(|_| home.join("Documents"));
    let downloads = app.path().download_dir().unwrap_or_else(|_| home.join("Downloads"));
    Ok(AppPaths {
        data: data.to_string_lossy().to_string(),
        exe_dir: exe_dir.to_string_lossy().to_string(),
        resources: resources.to_string_lossy().to_string(),
        home: home.to_string_lossy().to_string(),
        documents: documents.to_string_lossy().to_string(),
        downloads: downloads.to_string_lossy().to_string(),
    })
}

/// Instala una actualización: abre el instalador en modo silencioso (sin ninguna
/// ventana), con /UPDATE (conserva accesos directos) y /R (vuelve a abrir ATRIL al
/// terminar), y cierra la app: es el último momento posible, porque el instalador
/// necesita reemplazar sus archivos.
#[tauri::command]
pub fn update_install(app: tauri::AppHandle, installer: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        const DETACHED_PROCESS: u32 = 0x0000_0008;
        std::process::Command::new(&installer)
            .args(["/S", "/UPDATE", "/R"])
            .creation_flags(CREATE_NO_WINDOW | DETACHED_PROCESS)
            .spawn()
            .map_err(|e| format!("No se pudo iniciar el instalador: {e}"))?;
        app.exit(0);
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = (app, installer);
        Err("La actualización automática solo funciona en Windows.".into())
    }
}

/// Duración exacta de un WAV PCM leyendo su cabecera (bytes de audio ÷ bytes por segundo).
#[tauri::command]
pub fn wav_duration(path: String) -> Result<f64, String> {
    use std::io::{Read, Seek, SeekFrom};
    let mut f = std::fs::File::open(&path).map_err(|e| e.to_string())?;
    let mut head = [0u8; 12];
    f.read_exact(&mut head).map_err(|e| e.to_string())?;
    if &head[0..4] != b"RIFF" || &head[8..12] != b"WAVE" {
        return Err("No es un WAV".into());
    }
    let (mut rate, mut data) = (0u32, 0u64);
    let len = f.metadata().map_err(|e| e.to_string())?.len();
    loop {
        let mut ch = [0u8; 8];
        if f.read_exact(&mut ch).is_err() { break; }
        let size = u32::from_le_bytes([ch[4], ch[5], ch[6], ch[7]]) as u64;
        if &ch[0..4] == b"fmt " {
            let mut fmt = [0u8; 16];
            f.read_exact(&mut fmt).map_err(|e| e.to_string())?;
            rate = u32::from_le_bytes([fmt[8], fmt[9], fmt[10], fmt[11]]);
            f.seek(SeekFrom::Current(size as i64 - 16 + (size as i64 & 1))).map_err(|e| e.to_string())?;
        } else if &ch[0..4] == b"data" {
            // Algunos programas dejan el tamaño en 0 o en el máximo al escribir en flujo: se usa lo que queda del archivo
            let pos = f.stream_position().map_err(|e| e.to_string())?;
            data = if size == 0 || size == u32::MAX as u64 || pos + size > len { len - pos } else { size };
            break;
        } else {
            f.seek(SeekFrom::Current(size as i64 + (size as i64 & 1))).map_err(|e| e.to_string())?;
        }
    }
    if rate == 0 { return Err("WAV sin formato".into()); }
    Ok(data as f64 / rate as f64)
}

