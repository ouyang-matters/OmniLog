pub mod access;
pub mod admin;
pub mod assets;
pub mod auth;
pub mod billing;
pub mod entries;
pub mod export;
pub mod folders;
pub mod health;
pub mod messages;
pub mod search;
pub mod settings;
pub mod shares;
pub mod users;
pub mod versions;

use axum::routing::{delete, get, patch, post};
use axum::Router;
use tower_http::compression::CompressionLayer;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;

use crate::state::AppState;

/// Build the full application router with CORS, tracing, compression and the
/// auth boundary (everything under `/api` requires a valid bearer token).
pub fn build_router(state: AppState) -> Router {
    let cors = build_cors(&state);

    // Protected routes: require a valid token or JWT.
    let protected = Router::new()
        .route("/entries", get(entries::list).post(entries::create))
        .route(
            "/entries/:id",
            get(entries::get_one)
                .patch(entries::update)
                .delete(entries::delete),
        )
        .route("/entries/:id/versions", get(versions::list))
        .route("/entries/:id/restore", post(versions::restore))
        .route("/folders", get(folders::list).post(folders::create))
        .route("/folders/:id", patch(folders::update).delete(folders::delete))
        .route("/folders/:id/shares", get(shares::list).post(shares::create))
        .route(
            "/folders/:id/shares/:userId",
            patch(shares::update).delete(shares::delete),
        )
        .route("/settings", get(settings::get).patch(settings::update))
        .route("/assets/image", post(assets::upload_image))
        .route("/assets/:id", get(assets::get_one).delete(assets::delete))
        .route("/search", get(search::search))
        .route("/export", post(export::export))
        .route("/auth/me", get(auth::me).patch(auth::update_me))
        .route("/auth/change-password", post(auth::change_password))
        .route("/auth/license", get(billing::get_license))
        .route("/billing/checkout", post(billing::checkout))
        .route("/billing/portal", post(billing::portal))
        .route("/users", get(users::list).post(users::create))
        .route(
            "/users/:id",
            patch(users::update).delete(users::delete),
        )
        .route(
            "/admin/server-info",
            get(admin::get).patch(admin::update),
        )
        .route("/messages", get(messages::list))
        .route("/messages/read-all", post(messages::mark_all_read))
        .route("/messages/:id", delete(messages::delete))
        .route("/messages/:id/read", post(messages::mark_read))
        .route_layer(axum::middleware::from_fn_with_state(
            state.clone(),
            crate::auth::authenticate,
        ));

    // Public API routes (no auth): login, registration, verification,
    // password reset, plus the Stripe webhook (HMAC-authenticated).
    let rate_limited_auth = Router::new()
        .route("/auth/login", post(auth::login))
        .route("/auth/register", post(auth::register))
        .route("/auth/forgot-password", post(auth::forgot_password))
        .route("/auth/reset-password", post(auth::reset_password))
        .route_layer(axum::middleware::from_fn_with_state(
            state.clone(),
            crate::rate_limit::rate_limit_auth,
        ));

    let public_api = Router::new()
        .merge(rate_limited_auth)
        .route("/auth/verify-email", get(auth::verify_email))
        .route("/billing/webhook", post(billing::webhook));

    let api = public_api.merge(protected);

    Router::new()
        .route("/health", get(health::health))
        .nest("/api", api)
        .layer(CompressionLayer::new())
        .layer(TraceLayer::new_for_http())
        .layer(cors)
        .with_state(state)
}

fn build_cors(state: &AppState) -> CorsLayer {
    let base = CorsLayer::new()
        .allow_methods(Any)
        .allow_headers(Any);
    match state.config.cors_origins() {
        None => base.allow_origin(Any),
        Some(origins) => {
            let parsed: Vec<_> = origins
                .iter()
                .filter_map(|o| o.parse().ok())
                .collect();
            base.allow_origin(parsed)
        }
    }
}
