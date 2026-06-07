use axum::extract::{Path, State};
use axum::{Extension, Json};
use serde::Deserialize;

use crate::auth::AuthUser;
use crate::error::{AppError, AppResult};
use crate::models::entry::Entry;
use crate::models::version::Version;
use crate::models::{new_id, now_rfc3339};
use crate::routes::access;
use crate::state::AppState;

const SETTING_VERSIONING: &str = "versioning.enabled";

/// Whether snapshots should be captured. Defaults to enabled.
pub async fn versioning_enabled(state: &AppState) -> AppResult<bool> {
    Ok(state
        .storage
        .get_setting(SETTING_VERSIONING)
        .await?
        .map(|v| v != "false")
        .unwrap_or(true))
}

/// Capture a snapshot of `entry` at its current version.
pub async fn snapshot(state: &AppState, entry: &Entry) -> AppResult<()> {
    let v = Version {
        id: new_id(),
        entry_id: entry.id.clone(),
        user_id: entry.user_id.clone(),
        version: entry.version,
        title: entry.title.clone(),
        date: entry.date.clone(),
        content_json: entry.content_json.clone(),
        content_text: entry.content_text.clone(),
        content_html: entry.content_html.clone(),
        tags: entry.tags.clone(),
        created_at: now_rfc3339(),
        device_id: entry.device_id.clone(),
        mode: entry.mode.clone(),
    };
    state.storage.add_version(&v).await
}

/// GET /api/entries/:id/versions
pub async fn list(
    State(state): State<AppState>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<String>,
) -> AppResult<Json<Vec<Version>>> {
    let entry = state.storage.get_entry(&id).await?.ok_or(AppError::NotFound)?;
    if !access::can_read_entry(&state, &auth, &entry).await? {
        return Err(AppError::NotFound);
    }
    Ok(Json(state.storage.list_versions(&id).await?))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreInput {
    pub version: i64,
}

/// POST /api/entries/:id/restore — replace the entry's content with a past
/// version (snapshotting the current state first so the restore is itself
/// reversible).
pub async fn restore(
    State(state): State<AppState>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<String>,
    Json(input): Json<RestoreInput>,
) -> AppResult<Json<Entry>> {
    let mut entry = state.storage.get_entry(&id).await?.ok_or(AppError::NotFound)?;
    if entry.deleted_at.is_some() {
        return Err(AppError::NotFound);
    }
    if !access::can_write_entry(&state, &auth, &entry).await? {
        return Err(AppError::Unauthorized);
    }
    if !crate::limits::effective_limits(&state, &auth).await?.version_restore {
        return Err(AppError::PaymentRequired(
            "Restoring past versions is a Pro feature. Upgrade to roll back.".into(),
        ));
    }
    let target = state
        .storage
        .get_version(&id, input.version)
        .await?
        .ok_or(AppError::NotFound)?;

    if versioning_enabled(&state).await? {
        snapshot(&state, &entry).await?;
    }

    entry.title = target.title;
    entry.date = target.date;
    entry.content_json = target.content_json;
    entry.content_text = target.content_text;
    entry.content_html = target.content_html;
    entry.tags = target.tags;
    entry.mode = target.mode;
    entry.updated_at = now_rfc3339();
    entry.version += 1;
    entry.sync_status = "synced".to_string();

    state.storage.replace_entry(&entry).await?;
    Ok(Json(entry))
}
