use axum::Json;
use serde_json::json;

/// GET /health - unauthenticated connectivity probe used by the client's
/// "Test Connection" button. Shape matches `HealthResponse` in @omnilog/shared.
pub async fn health() -> Json<serde_json::Value> {
    Json(json!({
        "ok": true,
        "name": "OmniLog Server",
        "version": env!("CARGO_PKG_VERSION"),
    }))
}
