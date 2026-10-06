//! Procesos externos (Claude Code CLI, ffmpeg, ffprobe).
//! Se ejecutan sin ventana de consola, con stdin opcional (los prompts largos
//! van por stdin para evitar el límite de 32 KB de la línea de comandos de
//! Windows) y cancelables por id.
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Mutex;
use tauri::Emitter;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

#[derive(Default)]
pub struct Procs(pub Mutex<HashMap<String, u32>>);

#[derive(Deserialize)]
pub struct RunReq {
    id: String,
    program: String,
    #[serde(default)]
    args: Vec<String>,
    cwd: Option<String>,
    stdin: Option<String>,
    #[serde(default)]
    env: HashMap<String, String>,
    /// Emitir cada línea como evento `proc-line` (progreso de ffmpeg, etc.)
    #[serde(default)]
    stream: bool,
    timeout_s: Option<u64>,
}

#[derive(Serialize)]
pub struct RunRes {
    code: i32,
    stdout: String,
    stderr: String,
    timed_out: bool,
}

#[derive(Serialize, Clone)]
struct Line {
    id: String,
    stream: &'static str,
    line: String,
}

fn exts() -> Vec<&'static str> {
    if cfg!(windows) {
        vec![".exe", ".cmd", ".bat", ""]
    } else {
        vec![""]
    }
}

/// Busca un programa en PATH y en ubicaciones habituales de instalación.
#[tauri::command]
pub fn which(program: String) -> Option<String> {
    let p = Path::new(&program);
    if p.is_absolute() {
        return if p.exists() { Some(program) } else { None };
    }
    let mut dirs: Vec<PathBuf> = std::env::var_os("PATH")
        .map(|v| std::env::split_paths(&v).collect())
        .unwrap_or_default();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(d) = exe.parent() {
            dirs.insert(0, d.to_path_buf());
        }
    }
    if let Some(home) = std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }) {
        let h = PathBuf::from(home);
        dirs.push(h.join(".local").join("bin"));
        dirs.push(h.join(".claude").join("local"));
        dirs.push(h.join("AppData").join("Roaming").join("npm"));
    }
    for d in dirs {
        for e in exts() {
            let cand = d.join(format!("{program}{e}"));
            if cand.is_file() {
                return Some(cand.to_string_lossy().to_string());
            }
        }
    }
    None
}

fn build_command(program: &str, args: &[String]) -> tokio::process::Command {
    let resolved = which(program.to_string()).unwrap_or_else(|| program.to_string());
    let lower = resolved.to_lowercase();
    let mut cmd = if cfg!(windows) && (lower.ends_with(".cmd") || lower.ends_with(".bat")) {
        let mut c = tokio::process::Command::new("cmd.exe");
        c.arg("/D").arg("/S").arg("/C").arg(&resolved);
        c
    } else {
        tokio::process::Command::new(&resolved)
    };
    cmd.args(args);
    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

#[tauri::command]
pub async fn proc_run(app: tauri::AppHandle, procs: tauri::State<'_, Procs>, req: RunReq) -> Result<RunRes, String> {
    let mut cmd = build_command(&req.program, &req.args);
    if let Some(cwd) = &req.cwd {
        std::fs::create_dir_all(cwd).map_err(|e| e.to_string())?;
        cmd.current_dir(cwd);
    }
    for (k, v) in &req.env {
        cmd.env(k, v);
    }
    cmd.stdin(if req.stdin.is_some() { Stdio::piped() } else { Stdio::null() })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("No se pudo ejecutar «{}»: {e}", req.program))?;
    if let Some(pid) = child.id() {
        procs.0.lock().unwrap().insert(req.id.clone(), pid);
    }
    if let Some(input) = req.stdin.clone() {
        if let Some(mut si) = child.stdin.take() {
            tokio::spawn(async move {
                let _ = si.write_all(input.as_bytes()).await;
                let _ = si.shutdown().await;
            });
        }
    }
    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();
    let (id1, id2) = (req.id.clone(), req.id.clone());
    let (app1, app2) = (app.clone(), app.clone());
    let stream = req.stream;
    let out_task = tokio::spawn(async move {
        let mut buf = String::new();
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(l)) = lines.next_line().await {
            if stream {
                let _ = app1.emit("proc-line", Line { id: id1.clone(), stream: "stdout", line: l.clone() });
            }
            buf.push_str(&l);
            buf.push('\n');
        }
        buf
    });
    let err_task = tokio::spawn(async move {
        let mut buf = String::new();
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(l)) = lines.next_line().await {
            if stream {
                let _ = app2.emit("proc-line", Line { id: id2.clone(), stream: "stderr", line: l.clone() });
            }
            // Conservar solo el final de stderr (ffmpeg es muy verboso)
            if buf.len() > 200_000 {
                buf = buf.split_off(buf.len() - 100_000);
            }
            buf.push_str(&l);
            buf.push('\n');
        }
        buf
    });
    let timeout = std::time::Duration::from_secs(req.timeout_s.unwrap_or(4 * 3600));
    let (status, timed_out) = match tokio::time::timeout(timeout, child.wait()).await {
        Ok(s) => (s.map_err(|e| e.to_string())?.code().unwrap_or(-1), false),
        Err(_) => {
            let _ = child.kill().await;
            (-1, true)
        }
    };
    procs.0.lock().unwrap().remove(&req.id);
    let stdout = out_task.await.unwrap_or_default();
    let stderr = err_task.await.unwrap_or_default();
    Ok(RunRes { code: status, stdout, stderr, timed_out })
}

#[tauri::command]
pub fn proc_kill(procs: tauri::State<'_, Procs>, id: String) -> bool {
    let pid = procs.0.lock().unwrap().remove(&id);
    match pid {
        Some(pid) => kill_tree(pid),
        None => false,
    }
}

fn kill_tree(pid: u32) -> bool {
    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        use std::os::windows::process::CommandExt;
        std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .creation_flags(CREATE_NO_WINDOW)
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }
    #[cfg(not(windows))]
    {
        std::process::Command::new("kill")
            .args(["-9", &pid.to_string()])
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }
}
