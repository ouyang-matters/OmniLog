use axum::extract::{Path, Query, State};
use axum::{Extension, Json};
use serde::Deserialize;

use crate::auth::AuthUser;
use crate::error::{AppError, AppResult};
use crate::models::entry::{CreateEntryInput, Entry, UpdateEntryInput};
use crate::models::{new_id, now_rfc3339};
use crate::routes::access;
use crate::state::AppState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListQuery {
    pub tag: Option<String>,
    /// Folder to list. Absent = root.
    pub folder_id: Option<String>,
}

/// GET /api/entries - list non-deleted entries in a folder (root by default).
pub async fn list(
    State(state): State<AppState>,
    Extension(auth): Extension<AuthUser>,
    Query(q): Query<ListQuery>,
) -> AppResult<Json<Vec<Entry>>> {
    let tag = q.tag.as_deref();
    let entries = match q.folder_id.as_deref().filter(|s| !s.is_empty()) {
        Some(fid) => match access::folder_role(&state, &auth, fid).await? {
            Some(role) if role == "owner" => state.storage.list_entries(&auth.id, Some(fid), tag).await?,
            // Shared folder: show all entries it contains.
            Some(_) => state.storage.list_folder_entries(fid, tag).await?,
            None => return Err(AppError::Unauthorized),
        },
        None => state.storage.list_entries(&auth.id, None, tag).await?,
    };
    Ok(Json(entries))
}

/// POST /api/entries - create a new entry.
pub async fn create(
    State(state): State<AppState>,
    Extension(auth): Extension<AuthUser>,
    Json(input): Json<CreateEntryInput>,
) -> AppResult<Json<Entry>> {
    if input.date.trim().is_empty() {
        return Err(AppError::BadRequest("date is required".into()));
    }
    // Free-plan entry cap (official server only; self-hosted is unlimited).
    let lim = crate::limits::effective_limits(&state, &auth).await?;
    if let Some(max) = lim.max_entries {
        if state.storage.count_entries(&auth.id).await? >= max {
            return Err(AppError::PaymentRequired(format!(
                "Free plan is limited to {max} notes. Upgrade to Pro for unlimited notes."
            )));
        }
    }
    let folder_id = input.folder_id.filter(|s| !s.is_empty());
    if let Some(fid) = &folder_id {
        match access::folder_role(&state, &auth, fid).await? {
            Some(role) if role == "owner" || role == "editor" => {}
            _ => return Err(AppError::Unauthorized),
        }
    }
    let now = now_rfc3339();
    let mode = normalize_mode(input.mode.as_deref());
    let entry = Entry {
        id: new_id(),
        user_id: auth.id.clone(),
        folder_id,
        title: input.title,
        date: input.date,
        content_json: input.content_json,
        content_text: input.content_text,
        content_html: input.content_html,
        tags: input.tags,
        created_at: now.clone(),
        updated_at: now,
        deleted_at: None,
        version: 1,
        sync_status: "synced".to_string(),
        device_id: input.device_id,
        content_hash: input.content_hash,
        mode,
    };
    state.storage.insert_entry(&entry).await?;
    Ok(Json(entry))
}

/// GET /api/entries/:id
pub async fn get_one(
    State(state): State<AppState>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<String>,
) -> AppResult<Json<Entry>> {
    let entry = state.storage.get_entry(&id).await?.ok_or(AppError::NotFound)?;
    if entry.deleted_at.is_some() || !access::can_read_entry(&state, &auth, &entry).await? {
        return Err(AppError::NotFound);
    }
    Ok(Json(entry))
}

/// PATCH /api/entries/:id - partial update, bumps version + updatedAt.
pub async fn update(
    State(state): State<AppState>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<String>,
    Json(input): Json<UpdateEntryInput>,
) -> AppResult<Json<Entry>> {
    let mut entry = state.storage.get_entry(&id).await?.ok_or(AppError::NotFound)?;
    if entry.deleted_at.is_some() {
        return Err(AppError::NotFound);
    }
    if !access::can_write_entry(&state, &auth, &entry).await? {
        return Err(AppError::Unauthorized);
    }

    if let Some(base) = input.base_version {
        if entry.version != base {
            return Err(AppError::Conflict);
        }
    }

    if crate::routes::versions::versioning_enabled(&state).await? {
        crate::routes::versions::snapshot(&state, &entry).await?;
    }

    if let Some(v) = input.folder_id {
        entry.folder_id = if v.is_empty() { None } else { Some(v) };
    }
    if let Some(v) = input.title {
        entry.title = v;
    }
    if let Some(v) = input.date {
        entry.date = v;
    }
    if let Some(v) = input.content_json {
        entry.content_json = v;
    }
    if let Some(v) = input.content_text {
        entry.content_text = v;
    }
    if let Some(v) = input.content_html {
        entry.content_html = Some(v);
    }
    if let Some(v) = input.tags {
        entry.tags = v;
    }
    if let Some(v) = input.device_id {
        entry.device_id = v;
    }
    if let Some(v) = input.content_hash {
        entry.content_hash = Some(v);
    }
    if let Some(v) = input.mode {
        entry.mode = normalize_mode(Some(v.as_str()));
    }
    entry.updated_at = now_rfc3339();
    entry.version += 1;
    entry.sync_status = "synced".to_string();

    state.storage.replace_entry(&entry).await?;
    Ok(Json(entry))
}

fn normalize_mode(raw: Option<&str>) -> String {
    match raw.map(|s| s.trim()).unwrap_or("") {
        "latex" => "latex".to_string(),
        "markdown" => "markdown".to_string(),
        _ => "rich".to_string(),
    }
}

/// DELETE /api/entries/:id - soft delete (sets deletedAt).
pub async fn delete(
    State(state): State<AppState>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    let mut entry = state.storage.get_entry(&id).await?.ok_or(AppError::NotFound)?;
    if entry.deleted_at.is_some() {
        return Err(AppError::NotFound);
    }
    if !access::can_write_entry(&state, &auth, &entry).await? {
        return Err(AppError::Unauthorized);
    }
    entry.deleted_at = Some(now_rfc3339());
    entry.updated_at = now_rfc3339();
    entry.version += 1;
    entry.sync_status = "synced".to_string();
    state.storage.replace_entry(&entry).await?;
    Ok(Json(serde_json::json!({ "ok": true })))
}
