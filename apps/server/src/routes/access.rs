//! Access-control helpers for the multi-user model.
//!
//! Ownership: a document's `userId` is its owner. Sharing is at the folder
//! level: a folder owner can grant other users a role (viewer / editor / owner)
//! on that folder, which extends to the entries inside it.

use crate::auth::AuthUser;
use crate::error::AppResult;
use crate::models::entry::Entry;
use crate::state::AppState;

/// The caller's effective role on a folder, if any:
/// `Some("owner")` if they own it, otherwise the shared role, else `None`.
pub async fn folder_role(
    state: &AppState,
    auth: &AuthUser,
    folder_id: &str,
) -> AppResult<Option<String>> {
    if let Some(folder) = state.storage.get_folder(folder_id).await? {
        if folder.user_id == auth.id {
            return Ok(Some("owner".to_string()));
        }
    }
    Ok(state
        .storage
        .get_share(folder_id, &auth.id)
        .await?
        .map(|s| s.role))
}

fn role_can_write(role: &str) -> bool {
    role == "owner" || role == "editor"
}

/// Whether the caller can read an entry.
pub async fn can_read_entry(state: &AppState, auth: &AuthUser, entry: &Entry) -> AppResult<bool> {
    if entry.user_id == auth.id {
        return Ok(true);
    }
    if let Some(fid) = &entry.folder_id {
        return Ok(folder_role(state, auth, fid).await?.is_some());
    }
    Ok(false)
}

/// Whether the caller can modify an entry.
pub async fn can_write_entry(state: &AppState, auth: &AuthUser, entry: &Entry) -> AppResult<bool> {
    if entry.user_id == auth.id {
        return Ok(true);
    }
    if let Some(fid) = &entry.folder_id {
        if let Some(role) = folder_role(state, auth, fid).await? {
            return Ok(role_can_write(&role));
        }
    }
    Ok(false)
}
