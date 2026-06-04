use std::sync::Arc;

use crate::config::Config;
use crate::storage::Storage;

/// Shared application state. Cheap to clone (everything behind `Arc`), so it is
/// passed to handlers via `axum::extract::State`. `storage` is a trait object,
/// so handlers work the same against MongoDB or the embedded backend.
#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
    pub storage: Arc<dyn Storage>,
}

impl AppState {
    pub fn new(config: Config, storage: Arc<dyn Storage>) -> Self {
        Self {
            config: Arc::new(config),
            storage,
        }
    }
}
