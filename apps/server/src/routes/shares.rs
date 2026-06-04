use axum::extract::{Path, State};
use axum::{Extension, Json};

use crate::auth::AuthUser;
use crate::error::{AppError, AppResult};
use crate::models::folder::Folder;
use crate::models::message::Message;
use crate::models::share::{CreateShareInput, Share, UpdateShareInput};
use crate::models::{new_id, now_rfc3339};
use crate::state::AppState;

/// Only a folder's owner may manage its shares.
async fn require_owner(
    state: &AppState,
    auth: &AuthUser,
    folder_id: &str,
) -> AppResult<Folder> {
    let folder = state.storage.get_folder(folder_id).await?.ok_or(AppError::NotFound)?;
    if folder.user_id != auth.id && !auth.is_admin() {
        return Err(AppError::Unauthorized);
    }
    Ok(folder)
}

fn validate_role(role: &str) -> AppResult<&'static str> {
    match role {
        "viewer" => Ok("viewer"),
        "editor" => Ok("editor"),
        "owner" => Ok("owner"),
        _ => Err(AppError::BadRequest(
            "role must be viewer, editor or owner".into(),
        )),
    }
}

/// GET /api/folders/:id/shares
pub async fn list(
    State(state): State<AppState>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<String>,
) -> AppResult<Json<Vec<Share>>> {
    require_owner(&state, &auth, &id).await?;
    Ok(Json(state.storage.list_shares_for_folder(&id).await?))
}

/// POST /api/folders/:id/shares — grant a user access by username.
pub async fn create(
    State(state): State<AppState>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<String>,
    Json(input): Json<CreateShareInput>,
) -> AppResult<Json<Share>> {
    let folder = require_owner(&state, &auth, &id).await?;
    let role = validate_role(input.role.as_str())?;
    let user = state
        .storage
        .get_user_by_username(input.username.trim())
        .await?
        .ok_or_else(|| AppError::BadRequest("user not found".into()))?;
    if user.id == folder.user_id {
        return Err(AppError::BadRequest(
            "the folder owner already has full access".into(),
        ));
    }
    let share = Share {
        id: new_id(),
        folder_id: id.clone(),
        user_id: user.id.clone(),
        username: user.username.clone(),
        role: role.to_string(),
        created_at: now_rfc3339(),
    };
    state.storage.add_share(&share).await?;
    let _ = enqueue(
        &state,
        &user.id,
        "folder.shared",
        &format!("Folder \"{}\" shared with you", folder.name),
        &format!("{} gave you {} access.", auth.username, role),
        Some(folder.id.clone()),
    )
    .await;
    Ok(Json(share))
}

/// PATCH /api/folders/:id/shares/:userId — change an existing share's role.
pub async fn update(
    State(state): State<AppState>,
    Extension(auth): Extension<AuthUser>,
    Path((id, user_id)): Path<(String, String)>,
    Json(input): Json<UpdateShareInput>,
) -> AppResult<Json<Share>> {
    let folder = require_owner(&state, &auth, &id).await?;
    let role = validate_role(input.role.as_str())?;
    let updated = state
        .storage
        .update_share_role(&id, &user_id, role)
        .await?
        .ok_or(AppError::NotFound)?;
    let _ = enqueue(
        &state,
        &user_id,
        "share.role_changed",
        &format!("Your role on \"{}\" changed", folder.name),
        &format!("{} set your role to {}.", auth.username, role),
        Some(folder.id.clone()),
    )
    .await;
    Ok(Json(updated))
}

/// DELETE /api/folders/:id/shares/:userId
pub async fn delete(
    State(state): State<AppState>,
    Extension(auth): Extension<AuthUser>,
    Path((id, user_id)): Path<(String, String)>,
) -> AppResult<Json<serde_json::Value>> {
    let folder = require_owner(&state, &auth, &id).await?;
    let removed = state.storage.remove_share(&id, &user_id).await?;
    if removed {
        let _ = enqueue(
            &state,
            &user_id,
            "folder.unshared",
            &format!("Removed from \"{}\"", folder.name),
            &format!("{} revoked your access to this folder.", auth.username),
            None,
        )
        .await;
    }
    Ok(Json(serde_json::json!({ "ok": removed })))
}

async fn enqueue(
    state: &AppState,
    user_id: &str,
    kind: &str,
    title: &str,
    body: &str,
    link_folder_id: Option<String>,
) -> AppResult<()> {
    let msg = Message {
        id: new_id(),
        user_id: user_id.to_string(),
        kind: kind.to_string(),
        title: title.to_string(),
        body: body.to_string(),
        link_folder_id,
        created_at: now_rfc3339(),
        read_at: None,
    };
    state.storage.insert_message(&msg).await
}
