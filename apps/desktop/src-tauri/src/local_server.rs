//! Manage a bundled OmniLog server as a child process - the "one-click local
//! server". The server binary ships as a Tauri resource; we launch it with the
//! embedded (no-database) storage backend, pointed at a per-user data dir.

use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;

use serde::Deserialize;
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager, State};

/// Holds the running child process (if any). Managed by Tauri as app state.
#[derive(Default)]
pub struct LocalServer(pub Mutex<Option<Child>>);

#[derive(Debug, Deserialize)]
pub struct LocalServerOpts {
    pub port: u16,
    pub token: String,
}

/// Locate the server binary. Checks, in order:
///   1. The bundled Tauri resource (installed app).
///   2. Next to the running exe / in a `binaries` subfolder (portable build).
///   3. The dev source tree (running from `tauri dev`).
fn server_exe(app: &AppHandle) -> Option<PathBuf> {
    // 1. Bundled resource.
    if let Ok(p) = app
        .path()
        .resolve("binaries/omnilog-server.exe", BaseDirectory::Resource)
    {
        if p.exists() {
            return Some(p);
        }
    }

    // 2. Portable layout: alongside the executable.
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for cand in [
                dir.join("binaries/omnilog-server.exe"),
                dir.join("omnilog-server.exe"),
            ] {
                if cand.exists() {
                    return Some(cand);
                }
            }
        }
    }

    // 3. Dev source tree.
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    [
        manifest.join("binaries/omnilog-server.exe"),
        manifest.join("../../server/target/release/omnilog-server.exe"),
        manifest.join("../../server/target/debug/omnilog-server.exe"),
    ]
    .into_iter()
    .find(|p| p.exists())
}

#[tauri::command]
pub fn start_local_server(
    app: AppHandle,
    state: State<LocalServer>,
    opts: LocalServerOpts,
) -> Result<String, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;

    // Idempotent: if a healthy child is already running, do nothing.
    if let Some(child) = guard.as_mut() {
        match child.try_wait() {
            Ok(None) => return Ok("already-running".into()),
            _ => *guard = None, // exited - replace below
        }
    }

    let exe = server_exe(&app)
        .ok_or_else(|| "Bundled server binary not found.".to_string())?;
    let data_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?
        .join("server_data");
    std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;

    let mut cmd = Command::new(&exe);
    cmd.env("PORT", opts.port.to_string())
        .env("HOST", "127.0.0.1")
        .env("MONGODB_URI", "embedded") // -> embedded backend (no external database)
        .env("MONGODB_DB", "omnilog")
        .env("DATA_DIR", &data_dir)
        .env("API_TOKEN", &opts.token)
        .env("CORS_ORIGIN", "*")
        .env("RUST_LOG", "omnilog_server=info")
        // Run in the data dir so no stray .env elsewhere overrides the config.
        .current_dir(&data_dir);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let child = cmd
        .spawn()
        .map_err(|e| format!("Failed to start local server: {e}"))?;
    *guard = Some(child);
    Ok("started".into())
}

#[tauri::command]
pub fn stop_local_server(state: State<LocalServer>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(mut child) = guard.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    Ok(())
}

#[tauri::command]
pub fn local_server_running(state: State<LocalServer>) -> bool {
    match state.0.lock() {
        Ok(mut guard) => match guard.as_mut() {
            Some(child) => matches!(child.try_wait(), Ok(None)),
            None => false,
        },
        Err(_) => false,
    }
}

/// True if the given TCP port can be bound on localhost (i.e. it is free).
#[tauri::command]
pub fn is_port_free(port: u16) -> bool {
    std::net::TcpListener::bind(("127.0.0.1", port)).is_ok()
}

/// Find the first free localhost port at or after `start`.
#[tauri::command]
pub fn find_free_port(start: u16) -> u16 {
    let mut p = start.max(1024);
    for _ in 0..500 {
        if std::net::TcpListener::bind(("127.0.0.1", p)).is_ok() {
            return p;
        }
        p = p.saturating_add(1);
    }
    start
}

/// Kill whatever process is listening on the given port. Returns true if at
/// least one process was terminated. The user explicitly confirms this action.
#[tauri::command]
pub fn kill_port(port: u16) -> Result<bool, String> {
    let pids = pids_on_port(port);
    if pids.is_empty() {
        return Ok(false);
    }
    let mut killed = false;
    for pid in pids {
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            let _ = Command::new("taskkill")
                .args(["/F", "/PID", &pid.to_string()])
                .creation_flags(CREATE_NO_WINDOW)
                .output();
            killed = true;
        }
        #[cfg(not(windows))]
        {
            let _ = Command::new("kill").arg("-9").arg(pid.to_string()).output();
            killed = true;
        }
    }
    Ok(killed)
}

/// Find PIDs of processes listening on the given TCP port.
fn pids_on_port(port: u16) -> Vec<u32> {
    let suffix = format!(":{port}");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let output = match Command::new("netstat")
            .args(["-ano", "-p", "tcp"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
        {
            Ok(o) => o,
            Err(_) => return vec![],
        };
        let text = String::from_utf8_lossy(&output.stdout);
        let mut pids = Vec::new();
        for line in text.lines() {
            if !line.contains("LISTENING") {
                continue;
            }
            let cols: Vec<&str> = line.split_whitespace().collect();
            if cols.len() >= 5 && cols[1].ends_with(&suffix) {
                if let Ok(pid) = cols[cols.len() - 1].parse::<u32>() {
                    if pid != 0 && !pids.contains(&pid) {
                        pids.push(pid);
                    }
                }
            }
        }
        pids
    }
    #[cfg(not(windows))]
    {
        match Command::new("lsof")
            .args(["-ti", &format!("tcp{suffix}")])
            .output()
        {
            Ok(o) => String::from_utf8_lossy(&o.stdout)
                .lines()
                .filter_map(|l| l.trim().parse::<u32>().ok())
                .collect(),
            Err(_) => vec![],
        }
    }
}

/// A sensible default device name from the OS, for prefilling the setup form.
#[tauri::command]
pub fn default_device_name() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .ok()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "My Device".to_string())
}

/// Kill the child server if one is running (called on app exit).
pub fn kill_if_running(app: &AppHandle) {
    if let Some(state) = app.try_state::<LocalServer>() {
        if let Ok(mut guard) = state.0.lock() {
            if let Some(mut child) = guard.take() {
                let _ = child.kill();
            }
        }
    }
}
