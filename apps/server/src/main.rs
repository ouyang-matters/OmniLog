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

    // Create the initial admin user on first run.
    bootstrap_admin(storage.as_ref(), &config).await?;

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
        };
        storage.create_user(&user).await?;
        tracing::info!(username = %config.admin_username, "created initial owner user");
    }
    Ok(())
}
