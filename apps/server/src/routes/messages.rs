//! Notifications inbox. Every message belongs to a single recipient; this
//! handler set lets the recipient list, mark-read, and delete their own.

use axum::extract::{Path, State};
use axum::{Extension, Json};

use crate::auth::AuthUser;
use crate::error::{AppError, AppResult};
use crate::models::message::Message;
use crate::models::now_rfc3339;
use crate::state::AppState;

/// GET /api/messages — list the caller's messages, newest first.
pub async fn list(
    State(state): State<AppState>,
    Extension(auth): Extension<AuthUser>,
) -> AppResult<Json<Vec<Message>>> {
    Ok(Json(state.storage.list_messages(&auth.id).await?))
}

/// POST /api/messages/:id/read — mark a single message as read.
pub async fn mark_read(
    State(state): State<AppState>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    let msg = state.storage.get_message(&id).await?.ok_or(AppError::NotFound)?;
    if msg.user_id != auth.id {
        return Err(AppError::NotFound);
    }
    let changed = state
        .storage
        .mark_message_read(&auth.id, &id, &now_rfc3339())
        .await?;
    Ok(Json(serde_json::json!({ "ok": changed })))
}

/// POST /api/messages/read-all — mark every unread message read.
pub async fn mark_all_read(
    State(state): State<AppState>,
    Extension(auth): Extension<AuthUser>,
) -> AppResult<Json<serde_json::Value>> {
    let count = state
        .storage
        .mark_all_messages_read(&auth.id, &now_rfc3339())
        .await?;
    Ok(Json(serde_json::json!({ "ok": true, "count": count })))
}

/// DELETE /api/messages/:id — delete a single message (scoped to recipient).
pub async fn delete(
    State(state): State<AppState>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    let ok = state.storage.delete_message(&auth.id, &id).await?;
    Ok(Json(serde_json::json!({ "ok": ok })))
}
