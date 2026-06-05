use axum::extract::State;
use axum::response::IntoResponse;
use axum::{Extension, Json};
use serde::Serialize;

use crate::auth::{hash_password, issue_token, verify_password, AuthUser};
use crate::email::Email;
use crate::error::{AppError, AppResult};
use crate::models::user::{
    AuthToken, ChangePasswordInput, ForgotPasswordInput, LoginInput, PublicUser, RegisterInput,
    ResetPasswordInput, UpdateMeInput,
};
use crate::models::{new_id, now_rfc3339, DEFAULT_USER_ID};
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
            email_verified: false,
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

// ---------------------------------------------------------------------------
// Public: registration, email verification, password reset
// ---------------------------------------------------------------------------

fn generate_token() -> String {
    use rand::Rng;
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill(&mut bytes);
    hex::encode(bytes)
}

fn token_expiry_hours(hours: i64) -> String {
    (chrono::Utc::now() + chrono::Duration::hours(hours))
        .to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

fn is_expired(expires_at: &str) -> bool {
    chrono::DateTime::parse_from_rfc3339(expires_at)
        .map(|exp| chrono::Utc::now() > exp)
        .unwrap_or(true)
}

use crate::models::user::User;

/// POST /api/auth/register — public, rate-limited. Creates a new user with
/// email_verified=false and sends a verification email.
pub async fn register(
    State(state): State<AppState>,
    Json(input): Json<RegisterInput>,
) -> AppResult<Json<serde_json::Value>> {
    if !state.config.registration_enabled {
        return Err(AppError::BadRequest(
            "public registration is disabled on this server".into(),
        ));
    }
    let username = input.username.trim();
    let email = input.email.trim().to_lowercase();
    if username.is_empty() || username.len() > 64 {
        return Err(AppError::BadRequest("username must be 1-64 characters".into()));
    }
    if !email.contains('@') || email.len() < 5 {
        return Err(AppError::BadRequest("invalid email address".into()));
    }
    if input.password.len() < 6 {
        return Err(AppError::BadRequest("password must be at least 6 characters".into()));
    }
    // Check uniqueness.
    if state.storage.get_user_by_username(username).await?.is_some() {
        return Err(AppError::BadRequest("username already taken".into()));
    }
    if state.storage.get_user_by_email(&email).await?.is_some() {
        return Err(AppError::BadRequest("email already registered".into()));
    }

    let user = User {
        id: new_id(),
        username: username.to_string(),
        password_hash: hash_password(&input.password)?,
        role: "user".to_string(),
        created_at: now_rfc3339(),
        display_name: None,
        avatar_data_url: None,
        email: Some(email.clone()),
        email_verified: false,
    };
    state.storage.create_user(&user).await?;

    // Generate verification token (valid 24h).
    let token = generate_token();
    state
        .storage
        .insert_auth_token(&AuthToken {
            token: token.clone(),
            user_id: user.id.clone(),
            kind: "verify_email".to_string(),
            expires_at: token_expiry_hours(24),
        })
        .await?;

    // Send verification email.
    let verify_url = format!(
        "{}/api/auth/verify-email?token={}",
        state.config.public_url.trim_end_matches('/'),
        token
    );
    let body = format!(
        "<p>Welcome to OmniLog!</p>\
         <p>Click the link below to verify your email:</p>\
         <p><a href=\"{verify_url}\">{verify_url}</a></p>\
         <p>This link expires in 24 hours.</p>"
    );
    let _ = state
        .email
        .send(Email {
            to: &email,
            subject: "Verify your OmniLog account",
            body_html: &body,
        })
        .await;
    if !state.email.is_live() {
        tracing::info!(token = %token, email = %email, "email verification token (no email backend)");
    }

    Ok(Json(serde_json::json!({
        "ok": true,
        "message": "account created — check your email to verify"
    })))
}

/// GET /api/auth/verify-email?token=xxx — public. Marks the user's email as
/// verified and redirects to the app.
pub async fn verify_email(
    State(state): State<AppState>,
    axum::extract::Query(params): axum::extract::Query<std::collections::HashMap<String, String>>,
) -> AppResult<axum::response::Response> {
    let token_str = params.get("token").ok_or(AppError::BadRequest("missing token".into()))?;
    let token = state
        .storage
        .get_auth_token(token_str)
        .await?
        .ok_or(AppError::BadRequest("invalid or expired token".into()))?;
    if token.kind != "verify_email" || is_expired(&token.expires_at) {
        return Err(AppError::BadRequest("invalid or expired token".into()));
    }
    // Mark email as verified.
    if let Some(mut user) = state.storage.get_user(&token.user_id).await? {
        user.email_verified = true;
        state.storage.replace_user(&user).await?;
    }
    // Clean up tokens.
    state
        .storage
        .delete_auth_tokens_for(&token.user_id, "verify_email")
        .await?;

    // Redirect to the public URL (or a simple success page).
    let redirect = if state.config.public_url.is_empty() {
        "/".to_string()
    } else {
        state.config.public_url.clone()
    };
    Ok(axum::response::Redirect::to(&redirect).into_response())
}

/// POST /api/auth/forgot-password — public, rate-limited. Sends a password
/// reset email. Always returns 200 to prevent email enumeration.
pub async fn forgot_password(
    State(state): State<AppState>,
    Json(input): Json<ForgotPasswordInput>,
) -> AppResult<Json<serde_json::Value>> {
    let email = input.email.trim().to_lowercase();
    // Always return success to prevent email enumeration.
    let user = match state.storage.get_user_by_email(&email).await? {
        Some(u) => u,
        None => {
            return Ok(Json(serde_json::json!({
                "ok": true,
                "message": "if that email is registered, a reset link has been sent"
            })));
        }
    };

    // Clean up old reset tokens for this user.
    state
        .storage
        .delete_auth_tokens_for(&user.id, "reset_password")
        .await?;

    let token = generate_token();
    state
        .storage
        .insert_auth_token(&AuthToken {
            token: token.clone(),
            user_id: user.id.clone(),
            kind: "reset_password".to_string(),
            expires_at: token_expiry_hours(1),
        })
        .await?;

    let reset_url = format!(
        "{}/reset-password?token={}",
        state.config.public_url.trim_end_matches('/'),
        token
    );
    let body = format!(
        "<p>You requested a password reset for your OmniLog account.</p>\
         <p>Click the link below to set a new password:</p>\
         <p><a href=\"{reset_url}\">{reset_url}</a></p>\
         <p>This link expires in 1 hour. If you didn't request this, ignore this email.</p>"
    );
    let _ = state
        .email
        .send(Email {
            to: &email,
            subject: "Reset your OmniLog password",
            body_html: &body,
        })
        .await;
    if !state.email.is_live() {
        tracing::info!(token = %token, email = %email, "password reset token (no email backend)");
    }

    Ok(Json(serde_json::json!({
        "ok": true,
        "message": "if that email is registered, a reset link has been sent"
    })))
}

/// POST /api/auth/reset-password — public, rate-limited. Validates the token
/// and sets a new password.
pub async fn reset_password(
    State(state): State<AppState>,
    Json(input): Json<ResetPasswordInput>,
) -> AppResult<Json<serde_json::Value>> {
    if input.new_password.len() < 6 {
        return Err(AppError::BadRequest(
            "password must be at least 6 characters".into(),
        ));
    }
    let token = state
        .storage
        .get_auth_token(&input.token)
        .await?
        .ok_or(AppError::BadRequest("invalid or expired token".into()))?;
    if token.kind != "reset_password" || is_expired(&token.expires_at) {
        return Err(AppError::BadRequest("invalid or expired token".into()));
    }
    let mut user = state
        .storage
        .get_user(&token.user_id)
        .await?
        .ok_or(AppError::BadRequest("user not found".into()))?;
    user.password_hash = hash_password(&input.new_password)?;
    state.storage.replace_user(&user).await?;
    // Clean up tokens.
    state
        .storage
        .delete_auth_tokens_for(&token.user_id, "reset_password")
        .await?;
    let _ = enqueue_password_changed(&state, &user.id).await;

    Ok(Json(serde_json::json!({
        "ok": true,
        "message": "password has been reset"
    })))
}
