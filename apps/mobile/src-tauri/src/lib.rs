mod http_proxy;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            http_proxy::http_fetch,
            http_proxy::http_multipart,
        ])
        .run(tauri::generate_context!())
        .expect("error while building OmniLog Mobile");
}
