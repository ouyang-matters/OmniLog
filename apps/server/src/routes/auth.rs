use axum::extract::State;
use axum::{Extension, Json};
use serde::Serialize;

use crate::auth::{hash_password, issue_token, verify_password, AuthUser};
use crate::error::{AppError, AppResult};
use crate::models::user::{ChangePasswordInput, LoginInput, PublicUser, UpdateMeInput};
use crate::models::{now_rfc3339, DEFAULT_USER_ID};
use crate::state::AppState;

/// Hard limit on avatar payload size — applied after the multipart layer's
/// own body limit. Avatars are stored inline as data URLs in the user record,
/// so we keep this small. ~256 KB of base64 ≈ 192 KB of actual image bytes.
const MAX_AVATAR_BYTES: usize = 256 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginResponse {
    pub token: String,
    pub user: PublicUser,
}

/// POST /api/auth/login — public. Returns a JWT on success.
pub async fn login(
    State(state): State<AppState>,
    Json(input): Json<LoginInput>,
) -> AppResult<Json<LoginResponse>> {
    let user = state
        .storage
        .get_user_by_username(input.username.trim())
        .await?
        .ok_or(AppError::Unauthorized)?;
    if !verify_password(&input.password, &user.password_hash) {
        return Err(AppError::Unauthorized);
    }
    let token = issue_token(&state.config.api_token, &user.id, &user.username, &user.role)?;
    Ok(Json(LoginResponse {
        token,
        user: PublicUser::from(&user),
    }))
}

/// GET /api/auth/me — current user (works for both token and JWT auth).
pub async fn me(
    State(state): State<AppState>,
    Extension(auth): Extension<AuthUser>,
) -> AppResult<Json<PublicUser>> {
    if let Some(u) = state.storage.get_user(&auth.id).await? {
        Ok(Json(PublicUser::from(&u)))
    } else {
        // Bootstrap (API_TOKEN) principal — no stored row.
        Ok(Json(PublicUser {
            id: auth.id,
            username: auth.username,
            role: auth.role,
            created_at: String::new(),
            display_name: None,
            avatar_data_url: None,
            email: None,
        }))
    }
}

/// PATCH /api/auth/me — update the caller's own profile (display name +
/// avatar). The bootstrap principal has no stored row so it can't store a
/// display name or avatar — we surface a clear 400 instead of silently
/// dropping the change.
pub async fn update_me(
    State(state): State<AppState>,
    Extension(auth): Extension<AuthUser>,
    Json(input): Json<UpdateMeInput>,
) -> AppResult<Json<PublicUser>> {
    if auth.id == DEFAULT_USER_ID {
        return Err(AppError::BadRequest(
            "the bootstrap admin (API_TOKEN principal) has no stored profile — \
             create a real user to set display name and avatar".into(),
        ));
    }
    let mut user = state.storage.get_user(&auth.id).await?.ok_or(AppError::NotFound)?;
    if let Some(name) = input.display_name {
        let trimmed = name.trim();
        user.display_name = if trimmed.is_empty() { None } else { Some(trimmed.to_string()) };
    }
    if let Some(email) = input.email {
        let trimmed = email.trim();
        user.email = if trimmed.is_empty() { None } else { Some(trimmed.to_string()) };
    }
    if let Some(av) = input.avatar_data_url {
        if av.is_empty() {
            user.avatar_data_url = None;
        } else {
            if !av.starts_with("data:image/") {
                return Err(AppError::BadRequest(
                    "avatar must be a data:image/* URL".into(),
                ));
            }
            if av.len() > MAX_AVATAR_BYTES {
                return Err(AppError::BadRequest(format!(
                    "avatar too large ({} KB max)",
                    MAX_AVATAR_BYTES / 1024
                )));
            }
            user.avatar_data_url = Some(av);
        }
    }
    state.storage.replace_user(&user).await?;
    Ok(Json(PublicUser::from(&user)))
}

/// POST /api/auth/change-password — change the current user's password.
///
/// The bootstrap admin (API_TOKEN principal) has no password row to update,
/// so we reject and tell the caller to rotate `API_TOKEN` in env vars.
pub async fn change_password(
    State(state): State<AppState>,
    Extension(auth): Extension<AuthUser>,
    Json(input): Json<ChangePasswordInput>,
) -> AppResult<Json<serde_json::Value>> {
    if input.new_password.len() < 4 {
        return Err(AppError::BadRequest(
            "new password must be at least 4 characters".into(),
        ));
    }
    if auth.id == DEFAULT_USER_ID {
        return Err(AppError::BadRequest(
            "this account uses a static API token; rotate API_TOKEN in the server env instead".into(),
        ));
    }
    let mut user = state.storage.get_user(&auth.id).await?.ok_or(AppError::NotFound)?;
    if !verify_password(&input.old_password, &user.password_hash) {
        return Err(AppError::Unauthorized);
    }
    user.password_hash = hash_password(&input.new_password)?;
    state.storage.replace_user(&user).await?;
    let _ = enqueue_password_changed(&state, &user.id).await;
    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn enqueue_password_changed(state: &AppState, user_id: &str) -> AppResult<()> {
    use crate::models::message::Message;
    use crate::models::new_id;
    let msg = Message {
        id: new_id(),
        user_id: user_id.to_string(),
        kind: "user.password_changed".to_string(),
        title: "Password changed".to_string(),
        body: "Your password was changed. If this wasn't you, contact an administrator.".to_string(),
        link_folder_id: None,
        created_at: now_rfc3339(),
        read_at: None,
    };
    state.storage.insert_message(&msg).await
}
