//! HTTP transport — identical to desktop's http_proxy.rs.
//! Executes requests in Rust (reqwest) to avoid WebView CORS issues.

use base64::Engine;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpRequest {
    pub method: String,
    pub url: String,
    #[serde(default)]
    pub headers: Vec<(String, String)>,
    #[serde(default)]
    pub body: Option<String>,
    #[serde(default)]
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MultipartField {
    pub name: String,
    pub value: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MultipartFile {
    pub name: String,
    pub file_name: String,
    pub mime_type: String,
    pub base64: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MultipartRequest {
    pub url: String,
    #[serde(default)]
    pub headers: Vec<(String, String)>,
    #[serde(default)]
    pub fields: Vec<MultipartField>,
    pub file: MultipartFile,
    #[serde(default)]
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HttpResponse {
    pub status: u16,
    pub body_base64: String,
    pub content_type: Option<String>,
}

fn client(timeout_ms: Option<u64>) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_millis(timeout_ms.unwrap_or(15000)))
        .build()
        .map_err(|e| e.to_string())
}

async fn finish(resp: reqwest::Response) -> Result<HttpResponse, String> {
    let status = resp.status().as_u16();
    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    Ok(HttpResponse {
        status,
        body_base64: base64::engine::general_purpose::STANDARD.encode(&bytes),
        content_type,
    })
}

#[tauri::command]
pub async fn http_fetch(req: HttpRequest) -> Result<HttpResponse, String> {
    let method = reqwest::Method::from_bytes(req.method.to_uppercase().as_bytes())
        .map_err(|e| e.to_string())?;
    let mut rb = client(req.timeout_ms)?.request(method, &req.url);
    for (k, v) in &req.headers {
        rb = rb.header(k, v);
    }
    if let Some(body) = req.body {
        rb = rb.body(body);
    }
    let resp = rb.send().await.map_err(|e| e.to_string())?;
    finish(resp).await
}

#[tauri::command]
pub async fn http_multipart(req: MultipartRequest) -> Result<HttpResponse, String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(req.file.base64.as_bytes())
        .map_err(|e| e.to_string())?;

    let mut form = reqwest::multipart::Form::new();
    for f in req.fields {
        form = form.text(f.name, f.value);
    }
    let part = reqwest::multipart::Part::bytes(bytes)
        .file_name(req.file.file_name)
        .mime_str(&req.file.mime_type)
        .map_err(|e| e.to_string())?;
    form = form.part(req.file.name, part);

    let mut rb = client(req.timeout_ms)?.post(&req.url).multipart(form);
    for (k, v) in &req.headers {
        rb = rb.header(k, v);
    }
    let resp = rb.send().await.map_err(|e| e.to_string())?;
    finish(resp).await
}
