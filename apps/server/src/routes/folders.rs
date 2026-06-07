use axum::extract::{Path, State};
use axum::{Extension, Json};

use crate::auth::AuthUser;
use crate::error::{AppError, AppResult};
use crate::models::folder::{CreateFolderInput, Folder, FolderView, UpdateFolderInput};
use crate::models::message::Message;
use crate::models::{new_id, now_rfc3339};
use crate::state::AppState;

/// Build the response shape for a folder — `myRole` and (for shared folders)
/// `ownerUsername` are filled in for the listing endpoint.
async fn into_view(state: &AppState, auth: &AuthUser, folder: Folder, my_role: &str) -> FolderView {
    let owner_username = if folder.user_id != auth.id {
        match state.storage.get_user(&folder.user_id).await {
            Ok(Some(u)) => Some(u.username),
            _ => None,
        }
    } else {
        None
    };
    FolderView {
        folder,
        my_role: my_role.to_string(),
        owner_username,
    }
}

/// GET /api/folders - the caller's own folders plus folders shared with them.
pub async fn list(
    State(state): State<AppState>,
    Extension(auth): Extension<AuthUser>,
) -> AppResult<Json<Vec<FolderView>>> {
    let owned = state.storage.list_folders(&auth.id).await?;
    let mut out: Vec<FolderView> = Vec::with_capacity(owned.len());
    for f in owned {
        out.push(into_view(&state, &auth, f, "owner").await);
    }
    for share in state.storage.list_shares_for_user(&auth.id).await? {
        if out.iter().any(|v| v.folder.id == share.folder_id) {
            continue;
        }
        if let Some(f) = state.storage.get_folder(&share.folder_id).await? {
            out.push(into_view(&state, &auth, f, &share.role).await);
        }
    }
    Ok(Json(out))
}

/// POST /api/folders
pub async fn create(
    State(state): State<AppState>,
    Extension(auth): Extension<AuthUser>,
    Json(input): Json<CreateFolderInput>,
) -> AppResult<Json<FolderView>> {
    let name = input.name.trim();
    if name.is_empty() {
        return Err(AppError::BadRequest("folder name is required".into()));
    }
    // Free-plan folder cap (official server only).
    let lim = crate::limits::effective_limits(&state, &auth).await?;
    if let Some(max) = lim.max_folders {
        if state.storage.list_folders(&auth.id).await?.len() as u64 >= max {
            return Err(AppError::PaymentRequired(format!(
                "Free plan is limited to {max} folders. Upgrade to Pro for unlimited folders."
            )));
        }
    }
    let parent_id = input.parent_id.filter(|s| !s.is_empty());
    if let Some(ref pid) = parent_id {
        if state.storage.get_folder(pid).await?.is_none() {
            return Err(AppError::BadRequest("parent folder not found".into()));
        }
    }
    let now = now_rfc3339();
    let folder = Folder {
        id: new_id(),
        user_id: auth.id.clone(),
        parent_id,
        name: name.to_string(),
        created_at: now.clone(),
        updated_at: now,
    };
    state.storage.create_folder(&folder).await?;
    Ok(Json(into_view(&state, &auth, folder, "owner").await))
}

/// PATCH /api/folders/:id - rename or move (owner only).
pub async fn update(
    State(state): State<AppState>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<String>,
    Json(input): Json<UpdateFolderInput>,
) -> AppResult<Json<FolderView>> {
    let mut folder = state.storage.get_folder(&id).await?.ok_or(AppError::NotFound)?;
    if folder.user_id != auth.id && !auth.is_admin() {
        return Err(AppError::Unauthorized);
    }
    let old_name = folder.name.clone();
    let mut renamed = false;
    if let Some(name) = input.name {
        let name = name.trim().to_string();
        if name.is_empty() {
            return Err(AppError::BadRequest("folder name is required".into()));
        }
        if name != folder.name {
            folder.name = name;
            renamed = true;
        }
    }
    if let Some(parent) = input.parent_id {
        let parent = parent.trim();
        if parent == id {
            return Err(AppError::BadRequest("a folder cannot be its own parent".into()));
        }
        folder.parent_id = if parent.is_empty() {
            None
        } else {
            if state.storage.get_folder(parent).await?.is_none() {
                return Err(AppError::BadRequest("parent folder not found".into()));
            }
            Some(parent.to_string())
        };
    }
    folder.updated_at = now_rfc3339();
    state.storage.replace_folder(&folder).await?;

    if renamed {
        // Tell everyone the folder is shared with about the rename.
        for share in state.storage.list_shares_for_folder(&folder.id).await? {
            let _ = enqueue(
                &state,
                &share.user_id,
                "folder.renamed",
                &format!("Folder renamed: \"{}\" → \"{}\"", old_name, folder.name),
                &format!("{} renamed the folder.", auth.username),
                Some(folder.id.clone()),
            )
            .await;
        }
    }

    Ok(Json(into_view(&state, &auth, folder, "owner").await))
}

/// DELETE /api/folders/:id - owner only, and only when empty.
pub async fn delete(
    State(state): State<AppState>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    let folder = state.storage.get_folder(&id).await?.ok_or(AppError::NotFound)?;
    if folder.user_id != auth.id && !auth.is_admin() {
        return Err(AppError::Unauthorized);
    }
    let has_children = state
        .storage
        .list_folders(&auth.id)
        .await?
        .iter()
        .any(|f| f.parent_id.as_deref() == Some(id.as_str()));
    let entry_count = state.storage.count_entries_in_folder(&id).await?;
    if has_children || entry_count > 0 {
        return Err(AppError::BadRequest(
            "folder is not empty; move or delete its contents first".into(),
        ));
    }
    // Notify and revoke shares before deleting the folder itself.
    for share in state.storage.list_shares_for_folder(&id).await? {
        let _ = enqueue(
            &state,
            &share.user_id,
            "folder.deleted",
            &format!("Folder \"{}\" was deleted", folder.name),
            &format!("{} deleted this folder; your access has been revoked.", auth.username),
            None,
        )
        .await;
        state.storage.remove_share(&id, &share.user_id).await?;
    }
    state.storage.delete_folder(&id).await?;
    Ok(Json(serde_json::json!({ "ok": true })))
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
