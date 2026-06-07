use std::io::Cursor;

use axum::extract::{Multipart, Path, State};
use axum::http::header;
use axum::response::{IntoResponse, Response};
use axum::{Extension, Json};
use sha2::{Digest, Sha256};

use crate::auth::AuthUser;
use crate::config::resolve_in_data_dir;
use crate::error::{AppError, AppResult};
use crate::models::asset::Asset;
use crate::models::{new_id, now_rfc3339};
use crate::state::AppState;

/// POST /api/assets/image - multipart upload. Fields: `entryId`, optional
/// `caption`, and `file` (the image binary). Saves the binary under
/// DATA_DIR/assets/images and stores metadata in the database.
pub async fn upload_image(
    State(state): State<AppState>,
    Extension(auth): Extension<AuthUser>,
    mut multipart: Multipart,
) -> AppResult<Json<Asset>> {
    if !crate::limits::effective_limits(&state, &auth).await?.images {
        return Err(AppError::PaymentRequired(
            "Image upload is a Pro feature. Upgrade to attach images.".into(),
        ));
    }
    let mut entry_id: Option<String> = None;
    let mut caption: Option<String> = None;
    let mut original_name: Option<String> = None;
    let mut mime_type: Option<String> = None;
    let mut bytes: Option<Vec<u8>> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(format!("invalid multipart: {e}")))?
    {
        match field.name() {
            Some("entryId") => entry_id = Some(field.text().await.unwrap_or_default()),
            Some("caption") => caption = Some(field.text().await.unwrap_or_default()),
            Some("file") => {
                original_name = field.file_name().map(|s| s.to_string());
                mime_type = field.content_type().map(|s| s.to_string());
                let data = field
                    .bytes()
                    .await
                    .map_err(|e| AppError::BadRequest(format!("failed to read file: {e}")))?;
                bytes = Some(data.to_vec());
            }
            _ => {
                let _ = field.bytes().await;
            }
        }
    }

    let entry_id = entry_id
        .filter(|s| !s.trim().is_empty())
        .ok_or_else(|| AppError::BadRequest("entryId is required".into()))?;
    let data = bytes.ok_or_else(|| AppError::BadRequest("file is required".into()))?;
    if data.is_empty() {
        return Err(AppError::BadRequest("file is empty".into()));
    }

    // Resolve the MIME type and a file extension. Prefer the declared type,
    // fall back to sniffing the bytes.
    let mime = mime_type
        .filter(|m| m.starts_with("image/"))
        .or_else(|| {
            image::guess_format(&data)
                .ok()
                .map(|f| f.to_mime_type().to_string())
        })
        .ok_or_else(|| AppError::BadRequest("unsupported or non-image file".into()))?;
    let ext = mime_guess::get_mime_extensions_str(&mime)
        .and_then(|exts| exts.first().copied())
        .unwrap_or("bin");

    // Dimensions without a full decode where possible.
    let (width, height) = image::ImageReader::new(Cursor::new(&data))
        .with_guessed_format()
        .ok()
        .and_then(|r| r.into_dimensions().ok())
        .map(|(w, h)| (Some(w as i64), Some(h as i64)))
        .unwrap_or((None, None));

    let content_hash = {
        let mut hasher = Sha256::new();
        hasher.update(&data);
        hex::encode(hasher.finalize())
    };

    let id = new_id();
    let file_name = format!("{id}.{ext}");
    // storagePath is always DATA_DIR-relative with forward slashes.
    let storage_path = format!("assets/images/{file_name}");
    let abs_path = state.config.assets_dir().join(&file_name);
    tokio::fs::write(&abs_path, &data).await?;

    let now = now_rfc3339();
    let asset = Asset {
        id: id.clone(),
        user_id: auth.id.clone(),
        entry_id,
        kind: "image".to_string(),
        file_name,
        original_name,
        mime_type: mime,
        size: data.len() as i64,
        storage_path,
        public_url: Some(format!("/api/assets/{id}")),
        width,
        height,
        caption: caption.filter(|c| !c.is_empty()),
        created_at: now.clone(),
        updated_at: now,
        content_hash: Some(content_hash),
    };
    state.storage.insert_asset(&asset).await?;
    Ok(Json(asset))
}

/// GET /api/assets/:id - serve the binary with its stored content type.
pub async fn get_one(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> AppResult<Response> {
    let asset = state.storage.get_asset(&id).await?.ok_or(AppError::NotFound)?;

    let abs_path = resolve_in_data_dir(&state.config.data_dir, &asset.storage_path)
        .ok_or(AppError::NotFound)?;
    let data = tokio::fs::read(&abs_path)
        .await
        .map_err(|_| AppError::NotFound)?;

    Ok((
        [
            (header::CONTENT_TYPE, asset.mime_type),
            (header::CACHE_CONTROL, "private, max-age=31536000".to_string()),
        ],
        data,
    )
        .into_response())
}

/// DELETE /api/assets/:id - remove the file and its metadata.
pub async fn delete(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    let asset = state.storage.delete_asset(&id).await?.ok_or(AppError::NotFound)?;

    if let Some(abs_path) = resolve_in_data_dir(&state.config.data_dir, &asset.storage_path) {
        // Best-effort: a missing file should not fail the delete.
        let _ = tokio::fs::remove_file(&abs_path).await;
    }
    Ok(Json(serde_json::json!({ "ok": true })))
}
