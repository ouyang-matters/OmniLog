mod http_proxy;
mod local_server;

/// Read a file's raw bytes by absolute path. Used by the image picker: the
/// dialog plugin returns a path the user explicitly chose, and we read it here
/// rather than granting the broad filesystem scope the fs plugin would need.
#[tauri::command]
fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .manage(local_server::LocalServer::default())
        .invoke_handler(tauri::generate_handler![
            read_file_bytes,
            http_proxy::http_fetch,
            http_proxy::http_multipart,
            local_server::start_local_server,
            local_server::stop_local_server,
            local_server::local_server_running,
            local_server::is_port_free,
            local_server::find_free_port,
            local_server::kill_port,
            local_server::default_device_name,
        ])
        .build(tauri::generate_context!())
        .expect("error while building OmniLog")
        .run(|app_handle, event| {
            // Ensure the bundled local server is shut down with the app.
            if let tauri::RunEvent::Exit = event {
                local_server::kill_if_running(app_handle);
            }
        });
}
