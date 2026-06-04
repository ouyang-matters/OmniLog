use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::Argon2;
use axum::extract::{Request, State};
use axum::middleware::Next;
use axum::response::Response;
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::models::DEFAULT_USER_ID;
use crate::state::AppState;

/// The authenticated principal for a request, injected into request extensions.
#[derive(Clone, Debug)]
pub struct AuthUser {
    pub id: String,
    pub username: String,
    pub role: String,
}

impl AuthUser {
    /// The bootstrap principal (authenticated via the static API_TOKEN) is the
    /// server operator and gets `owner` powers. A stored user with role "owner"
    /// is also an owner.
    pub fn is_owner(&self) -> bool {
        self.role == "owner"
    }

    /// True for both `owner` and `admin`. Most user-management actions need
    /// this; promoting to admin/owner or editing other admins needs `is_owner`.
    pub fn is_admin(&self) -> bool {
        self.role == "admin" || self.role == "owner"
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,
    pub username: String,
    pub role: String,
    pub exp: usize,
}

/// Issue a JWT for a user (valid ~30 days), signed with the server secret.
pub fn issue_token(secret: &str, id: &str, username: &str, role: &str) -> Result<String, AppError> {
    let exp = (chrono::Utc::now().timestamp() + 60 * 60 * 24 * 30) as usize;
    let claims = Claims {
        sub: id.to_string(),
        username: username.to_string(),
        role: role.to_string(),
        exp,
    };
    encode(&Header::default(), &claims, &EncodingKey::from_secret(secret.as_bytes()))
        .map_err(|e| AppError::Other(anyhow::anyhow!(e)))
}

fn decode_token(secret: &str, token: &str) -> Option<Claims> {
    decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )
    .ok()
    .map(|d| d.claims)
}

pub fn hash_password(password: &str) -> Result<String, AppError> {
    let mut salt_bytes = [0u8; 16];
    rand::Rng::fill(&mut rand::thread_rng(), &mut salt_bytes);
    let salt = SaltString::encode_b64(&salt_bytes)
        .map_err(|e| AppError::Other(anyhow::anyhow!(e.to_string())))?;
    let hash = Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| AppError::Other(anyhow::anyhow!(e.to_string())))?
        .to_string();
    Ok(hash)
}

pub fn verify_password(password: &str, hash: &str) -> bool {
    PasswordHash::new(hash)
        .and_then(|ph| Argon2::default().verify_password(password.as_bytes(), &ph))
        .is_ok()
}

/// Authenticate every `/api/*` request. Accepts either:
///   - the static `API_TOKEN` (authenticates as the bootstrap admin), or
///   - a user JWT issued by `/api/auth/login`.
/// The resolved `AuthUser` is placed in request extensions for handlers.
pub async fn authenticate(
    State(state): State<AppState>,
    mut request: Request,
    next: Next,
) -> Result<Response, AppError> {
    let provided = request
        .headers()
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|h| h.strip_prefix("Bearer "))
        .map(str::trim);

    let token = provided.ok_or(AppError::Unauthorized)?;

    let auth = if constant_time_eq(token, &state.config.api_token) {
        // The static API_TOKEN authenticates the server operator — always
        // treated as `owner` regardless of any stored row.
        AuthUser {
            id: DEFAULT_USER_ID.to_string(),
            username: state.config.admin_username.clone(),
            role: "owner".to_string(),
        }
    } else if let Some(claims) = decode_token(&state.config.api_token, token) {
        AuthUser {
            id: claims.sub,
            username: claims.username,
            role: claims.role,
        }
    } else {
        return Err(AppError::Unauthorized);
    };

    request.extensions_mut().insert(auth);
    Ok(next.run(request).await)
}

fn constant_time_eq(a: &str, b: &str) -> bool {
    let (a, b) = (a.as_bytes(), b.as_bytes());
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}
