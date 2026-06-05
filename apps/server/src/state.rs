use std::sync::Arc;

use crate::config::Config;
use crate::email::EmailSender;
use crate::rate_limit::RateLimiter;
use crate::storage::Storage;

/// Shared application state. Cheap to clone (everything behind `Arc`), so it is
/// passed to handlers via `axum::extract::State`. `storage` is a trait object,
/// so handlers work the same against MongoDB or the embedded backend.
#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
    pub storage: Arc<dyn Storage>,
    /// Strict rate limiter for auth endpoints (login/register/forgot-password).
    pub auth_limiter: RateLimiter,
    /// Email sender (abstract — pluggable backend).
    pub email: Arc<dyn EmailSender>,
}

impl AppState {
    pub fn new(
        config: Config,
        storage: Arc<dyn Storage>,
        email: Arc<dyn EmailSender>,
    ) -> Self {
        // Auth endpoints: 10 requests per 60 seconds per IP.
        let auth_limiter = RateLimiter::new(60, 10);
        Self {
            config: Arc::new(config),
            storage,
            auth_limiter,
            email,
        }
    }
}
