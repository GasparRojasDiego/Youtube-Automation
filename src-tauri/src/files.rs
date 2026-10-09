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
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn fs_remove(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.is_dir() {
        std::fs::remove_dir_all(p).map_err(|e| e.to_string())
    } else if p.exists() {
        std::fs::remove_file(p).map_err(|e| e.to_string())
    } else {
        Ok(())
    }
}

#[tauri::command]
pub fn fs_copy(from: String, to: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&to).parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::copy(&from, &to).map(|_| ()).map_err(|e| format!("No se pudo copiar {from}: {e}"))
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

/// Instala una actualización: espera a que ATRIL se cierre, ejecuta el
/// instalador en modo silencioso y vuelve a abrir la app (solo Windows).
#[tauri::command]
pub fn update_install(app: tauri::AppHandle, installer: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let pid = std::process::id();
        // ping como pausa: «timeout» falla en procesos sin consola
        let script = format!(
            "@echo off\r\n:wait\r\ntasklist /FI \"PID eq {pid}\" 2>nul | find \"{pid}\" >nul && (ping -n 2 127.0.0.1 >nul & goto wait)\r\n\"{installer}\" /S\r\nping -n 2 127.0.0.1 >nul\r\nstart \"\" \"{exe}\"\r\ndel \"%~f0\"\r\n",
            pid = pid,
            installer = installer,
            exe = exe.to_string_lossy()
        );
        let path = std::env::temp_dir().join("atril-actualizar.cmd");
        std::fs::write(&path, script).map_err(|e| format!("No se pudo preparar la actualización: {e}"))?;
        const DETACHED_PROCESS: u32 = 0x0000_0008;
        const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        std::process::Command::new("cmd")
            .arg("/C")
            .arg(&path)
            .creation_flags(DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW)
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
