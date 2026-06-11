mod auth;
mod billing;
mod config;
mod error;
mod models;
mod routes;
mod state;
mod storage;

use std::sync::Arc;

use anyhow::Result;
use axum::extract::DefaultBodyLimit;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;
use tracing_subscriber::{fmt, EnvFilter};

use crate::config::Config;
use crate::models::user::User;
use crate::models::{now_rfc3339, DEFAULT_USER_ID};
use crate::state::AppState;
use crate::storage::json::JsonStorage;
use crate::storage::mongo::MongoStorage;
use crate::storage::Storage;

/// Max request body (covers multipart image uploads).
const MAX_BODY_BYTES: usize = 32 * 1024 * 1024;

#[tokio::main]
async fn main() -> Result<()> {
    // Load .env from CWD if present; real env vars always win.
    dotenvy::dotenv().ok();

    let config = Config::from_env()?;
    config.ensure_dirs()?;

    // Log to stdout AND a rolling daily file under DATA_DIR/logs. The guard must
    // stay alive for the process lifetime, so it is bound in main.
    let file_appender = tracing_appender::rolling::daily(config.logs_dir(), "omnilog-server.log");
    let (file_writer, _guard) = tracing_appender::non_blocking(file_appender);
    let filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("omnilog_server=info,tower_http=info"));
    tracing_subscriber::registry()
        .with(filter)
        .with(fmt::layer().with_target(false))
        .with(fmt::layer().with_ansi(false).with_writer(file_writer))
        .init();

    tracing::info!(data_dir = %config.data_dir.display(), "starting OmniLog server");

    // Pick a storage backend. Empty MONGODB_URI -> embedded (zero-dependency)
    // store, which is what the desktop one-click local server uses.
    let storage: Arc<dyn Storage> = if config.use_embedded() {
        tracing::info!("storage backend: embedded (file-backed, no external database)");
        Arc::new(JsonStorage::load(&config.data_dir).await?)
    } else {
        tracing::info!(uri = %config.mongodb_uri, db = %config.mongodb_db, "storage backend: MongoDB");
        Arc::new(MongoStorage::connect(&config).await?)
    };

    // Create the initial admin user on first run, then seed any superusers
    // declared in env vars (always runs; idempotent on existing rows).
    bootstrap_admin(storage.as_ref(), &config).await?;
    bootstrap_superusers(storage.as_ref(), &config).await?;

    let addr = format!("{}:{}", config.host, config.port);
    let state = AppState::new(config, storage);
    let app = routes::build_router(state).layer(DefaultBodyLimit::max(MAX_BODY_BYTES));

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!("OmniLog server listening on http://{addr}");
    axum::serve(listener, app).await?;

    Ok(())
}

/// Create the bootstrap admin user if no users exist yet. Its id is the legacy
/// `DEFAULT_USER_ID`, so existing single-user data and static-token auth map to
/// this admin.
async fn bootstrap_admin(storage: &dyn Storage, config: &Config) -> Result<()> {
    if storage.count_users().await? == 0 {
        let user = User {
            id: DEFAULT_USER_ID.to_string(),
            username: config.admin_username.clone(),
            password_hash: auth::hash_password(&config.admin_password)
                .map_err(|e| anyhow::anyhow!(e.to_string()))?,
            // Same identity as the static-token principal; both should be
            // owner so password login and token auth give matching powers.
            role: "owner".to_string(),
            created_at: now_rfc3339(),
            display_name: None,
            avatar_data_url: None,
            email: None,
        };
        storage.create_user(&user).await?;
        tracing::info!(username = %config.admin_username, "created initial owner user");
    }
    Ok(())
}

/// Ensure every username listed in `SUPERUSER_USERNAMES` has a corresponding
/// stored user row. Only creates rows that don't already exist; never edits
/// passwords, roles, or profile fields on existing accounts. The first
/// superuser in the list gets the configured email + display name + password
/// at creation time; later superusers (if any) get just the username and a
/// placeholder password that must be reset before login.
///
/// All personal data is sourced from env vars so the repository never
/// contains identifying values.
async fn bootstrap_superusers(storage: &dyn Storage, config: &Config) -> Result<()> {
    if config.superuser_usernames.is_empty() {
        return Ok(());
    }
    for (idx, username) in config.superuser_usernames.iter().enumerate() {
        if storage.get_user_by_username(username).await?.is_some() {
            tracing::debug!(username = %username, "superuser already present");
            continue;
        }
        let is_first = idx == 0;
        let password = if is_first && !config.superuser_password.is_empty() {
            config.superuser_password.clone()
        } else {
            // Random placeholder; owner can reset via PATCH /api/users/:id.
            // Picked long enough that brute force is infeasible.
            let mut bytes = [0u8; 24];
            rand::Rng::fill(&mut rand::thread_rng(), &mut bytes);
            hex::encode(bytes)
        };
        let user = User {
            id: crate::models::new_id(),
            username: username.clone(),
            password_hash: auth::hash_password(&password)
                .map_err(|e| anyhow::anyhow!(e.to_string()))?,
            role: "owner".to_string(),
            created_at: now_rfc3339(),
            display_name: if is_first && !config.superuser_display_name.is_empty() {
                Some(config.superuser_display_name.clone())
            } else {
                None
            },
            avatar_data_url: None,
            email: if is_first && !config.superuser_email.is_empty() {
                Some(config.superuser_email.clone())
            } else {
                None
            },
        };
        storage.create_user(&user).await?;
        tracing::info!(
            username = %username,
            "seeded superuser (permanently unlimited license)"
        );
    }
    Ok(())
}
