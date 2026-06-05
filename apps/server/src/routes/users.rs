use axum::extract::{Path, State};
use axum::{Extension, Json};

use crate::auth::{hash_password, AuthUser};
use crate::error::{AppError, AppResult};
use crate::models::user::{CreateUserInput, PublicUser, UpdateUserInput, User};
use crate::models::{new_id, now_rfc3339, DEFAULT_USER_ID};
use crate::state::AppState;

/// Role hierarchy. `owner` > `admin` > `user`. Equal values share the same
/// management surface (e.g. an admin cannot promote another admin to owner).
fn role_rank(role: &str) -> i32 {
    match role {
        "owner" => 3,
        "admin" => 2,
        "user" => 1,
        _ => 0,
    }
}

fn normalize_role(raw: &str, fallback: &str) -> &'static str {
    match raw {
        "owner" => "owner",
        "admin" => "admin",
        "user" => "user",
        _ => match fallback {
            "owner" => "owner",
            "admin" => "admin",
            _ => "user",
        },
    }
}

/// GET /api/users — admin or owner.
pub async fn list(
    State(state): State<AppState>,
    Extension(auth): Extension<AuthUser>,
) -> AppResult<Json<Vec<PublicUser>>> {
    if !auth.is_admin() {
        return Err(AppError::Unauthorized);
    }
    let users = state.storage.list_users().await?;
    Ok(Json(users.iter().map(PublicUser::from).collect()))
}

/// POST /api/users — create a user.
///
/// `admin` may create `user` accounts; only `owner` may create another `admin`
/// or `owner`. Bootstrap admin always counts as `owner` (see `auth::authenticate`).
pub async fn create(
    State(state): State<AppState>,
    Extension(auth): Extension<AuthUser>,
    Json(input): Json<CreateUserInput>,
) -> AppResult<Json<PublicUser>> {
    if !auth.is_admin() {
        return Err(AppError::Unauthorized);
    }
    let username = input.username.trim();
    if username.is_empty() || input.password.len() < 4 {
        return Err(AppError::BadRequest(
            "username required and password must be at least 4 characters".into(),
        ));
    }
    if state.storage.get_user_by_username(username).await?.is_some() {
        return Err(AppError::BadRequest("username already exists".into()));
    }
    let role = normalize_role(input.role.as_deref().unwrap_or(""), "user");
    if role_rank(role) >= role_rank("admin") && !auth.is_owner() {
        return Err(AppError::Unauthorized);
    }
    let user = User {
        id: new_id(),
        username: username.to_string(),
        password_hash: hash_password(&input.password)?,
        role: role.to_string(),
        created_at: now_rfc3339(),
        display_name: input.display_name.filter(|s| !s.trim().is_empty()),
        avatar_data_url: None,
        email: None,
        email_verified: false,
    };
    state.storage.create_user(&user).await?;
    Ok(Json(PublicUser::from(&user)))
}

/// PATCH /api/users/:id — admin/owner: change role and/or reset password.
///
/// Authorization rules:
/// - You cannot edit the bootstrap admin row (its identity lives in env vars).
/// - You cannot edit a user whose role rank is >= your own (admins can't edit
///   admins/owners; owners can edit anyone except the bootstrap principal).
/// - Promoting *to* admin or owner requires owner.
/// - Owners can't demote themselves through this endpoint.
pub async fn update(
    State(state): State<AppState>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<String>,
    Json(input): Json<UpdateUserInput>,
) -> AppResult<Json<PublicUser>> {
    if !auth.is_admin() {
        return Err(AppError::Unauthorized);
    }
    if id == DEFAULT_USER_ID {
        return Err(AppError::BadRequest(
            "the bootstrap admin (API_TOKEN) is managed via server env vars".into(),
        ));
    }
    let mut user = state.storage.get_user(&id).await?.ok_or(AppError::NotFound)?;

    // Caller must outrank the target (unless it's themselves and they're owner).
    let caller_rank = role_rank(&auth.role);
    let target_rank = role_rank(&user.role);
    let editing_self = user.id == auth.id;
    if !editing_self && target_rank >= caller_rank {
        return Err(AppError::Unauthorized);
    }

    let mut role_changed = false;
    if let Some(role) = input.role {
        let role = match role.as_str() {
            "owner" | "admin" | "user" => role,
            _ => return Err(AppError::BadRequest("role must be 'owner', 'admin' or 'user'".into())),
        };
        // Promoting to admin or owner requires owner.
        if role_rank(&role) >= role_rank("admin") && !auth.is_owner() {
            return Err(AppError::Unauthorized);
        }
        // Don't allow the last owner to demote themselves.
        if editing_self && auth.is_owner() && role != "owner" {
            return Err(AppError::BadRequest("you cannot demote yourself".into()));
        }
        if user.role != role {
            user.role = role;
            role_changed = true;
        }
    }

    let mut password_changed = false;
    if let Some(pw) = input.password {
        if !pw.is_empty() {
            if pw.len() < 4 {
                return Err(AppError::BadRequest(
                    "password must be at least 4 characters".into(),
                ));
            }
            user.password_hash = hash_password(&pw)?;
            password_changed = true;
        }
    }

    if let Some(name) = input.display_name {
        let trimmed = name.trim();
        user.display_name = if trimmed.is_empty() { None } else { Some(trimmed.to_string()) };
    }

    state.storage.replace_user(&user).await?;

    if role_changed || password_changed {
        let body = match (role_changed, password_changed) {
            (true, true) => format!(
                "An administrator changed your role to '{}' and reset your password.",
                user.role
            ),
            (true, false) => format!(
                "An administrator changed your role to '{}'.",
                user.role
            ),
            (false, true) => "An administrator reset your password.".to_string(),
            _ => String::new(),
        };
        let _ = enqueue(&state, &user.id, "user.updated", "Account updated", &body, None).await;
    }

    Ok(Json(PublicUser::from(&user)))
}

/// DELETE /api/users/:id — admin/owner only.
pub async fn delete(
    State(state): State<AppState>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<String>,
) -> AppResult<Json<serde_json::Value>> {
    if !auth.is_admin() {
        return Err(AppError::Unauthorized);
    }
    if id == DEFAULT_USER_ID {
        return Err(AppError::BadRequest(
            "the bootstrap admin is managed via server env vars".into(),
        ));
    }
    if id == auth.id {
        return Err(AppError::BadRequest("you cannot delete your own account".into()));
    }
    let user = state.storage.get_user(&id).await?.ok_or(AppError::NotFound)?;
    if role_rank(&user.role) >= role_rank(&auth.role) {
        return Err(AppError::Unauthorized);
    }

    // Drop every share granted *to* this user.
    for share in state.storage.list_shares_for_user(&id).await? {
        state.storage.remove_share(&share.folder_id, &id).await?;
    }

    let ok = state.storage.delete_user(&id).await?;
    Ok(Json(serde_json::json!({ "ok": ok, "username": user.username })))
}

async fn enqueue(
    state: &AppState,
    user_id: &str,
    kind: &str,
    title: &str,
    body: &str,
    link_folder_id: Option<String>,
) -> AppResult<()> {
    use crate::models::message::Message;
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
