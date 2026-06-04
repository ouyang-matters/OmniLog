//! Owner-level administration: inspect runtime configuration (DB, ports,
//! CORS, data dir) and update the editable subset stored in the settings
//! collection. Environment-variable defaults are reported but flagged as
//! requiring a server restart to actually take effect.

use axum::extract::State;
use axum::{Extension, Json};
use serde::{Deserialize, Serialize};

use crate::auth::AuthUser;
use crate::error::{AppError, AppResult};
use crate::state::AppState;

const SETTING_CORS_OVERRIDE: &str = "server.cors_origin";
const SETTING_PUBLIC_URL: &str = "server.public_url";

/// Mask credentials in a Mongo URI so we never echo the password back over the
/// wire. Handles `mongodb://user:pw@host` and `mongodb+srv://user:pw@host`.
fn mask_mongo_uri(uri: &str) -> String {
    let scheme_end = uri.find("://").map(|i| i + 3).unwrap_or(0);
    let (scheme, rest) = uri.split_at(scheme_end);
    if let Some(at) = rest.find('@') {
        if let Some(colon) = rest[..at].find(':') {
            // user:password@host -> user:****@host
            let user = &rest[..colon];
            let host = &rest[at..];
            return format!("{scheme}{user}:****{host}");
        }
    }
    uri.to_string()
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerInfo {
    pub version: String,
    pub host: String,
    pub port: u16,
    pub data_dir: String,
    /// Whether the server is running with the embedded JSON storage backend
    /// instead of a real Mongo connection.
    pub embedded: bool,
    pub database_name: String,
    /// Credentials masked.
    pub database_uri_masked: String,
    /// Original env-var CORS value (always "*" or a comma-separated allowlist).
    pub cors_origin_env: String,
    /// Effective CORS value — the override stored in settings, if any, else the env.
    pub cors_origin_effective: String,
    /// Free-form note the owner can use to remember the public URL the server
    /// is reachable at (e.g. through a reverse proxy or tunnel). Editable.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub public_url: Option<String>,
    /// Number of stored users (for "did the bootstrap admin make any real users
    /// yet?" sanity checks on the Advanced page).
    pub user_count: u64,
    /// True when the request was authenticated via the static API_TOKEN.
    pub via_api_token: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateServerInfo {
    /// Set to `Some("")` to clear the override and fall back to the env-var
    /// value; `Some(...)` to set; absent to leave unchanged.
    pub cors_origin: Option<String>,
    pub public_url: Option<String>,
}

/// GET /api/admin/server-info — owner only.
pub async fn get(
    State(state): State<AppState>,
    Extension(auth): Extension<AuthUser>,
) -> AppResult<Json<ServerInfo>> {
    if !auth.is_owner() {
        return Err(AppError::Unauthorized);
    }
    let cors_env = state.config.cors_origin.clone();
    let cors_override = state.storage.get_setting(SETTING_CORS_OVERRIDE).await?;
    let public_url = state.storage.get_setting(SETTING_PUBLIC_URL).await?;
    let user_count = state.storage.count_users().await?;

    Ok(Json(ServerInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        host: state.config.host.clone(),
        port: state.config.port,
        data_dir: state.config.data_dir.display().to_string(),
        embedded: state.config.use_embedded(),
        database_name: state.config.mongodb_db.clone(),
        database_uri_masked: mask_mongo_uri(&state.config.mongodb_uri),
        cors_origin_env: cors_env.clone(),
        cors_origin_effective: cors_override.unwrap_or(cors_env),
        public_url: public_url.filter(|s| !s.is_empty()),
        user_count,
        via_api_token: auth.id == crate::models::DEFAULT_USER_ID,
    }))
}

/// PATCH /api/admin/server-info — owner only. Updates the editable subset.
/// Note: `cors_origin` here is the runtime override stored in the settings
/// collection. The actual CORS layer is built at startup from env vars, so
/// changes here surface on the dashboard but only take effect after a restart
/// (logged as a notice in the response).
pub async fn update(
    State(state): State<AppState>,
    Extension(auth): Extension<AuthUser>,
    Json(input): Json<UpdateServerInfo>,
) -> AppResult<Json<serde_json::Value>> {
    if !auth.is_owner() {
        return Err(AppError::Unauthorized);
    }
    let mut restart_required = false;
    if let Some(cors) = input.cors_origin {
        state.storage.set_setting(SETTING_CORS_OVERRIDE, cors.trim()).await?;
        restart_required = true;
    }
    if let Some(url) = input.public_url {
        state.storage.set_setting(SETTING_PUBLIC_URL, url.trim()).await?;
    }
    Ok(Json(serde_json::json!({
        "ok": true,
        "restartRequired": restart_required,
    })))
}
