use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;

/// Unified API error type. Every handler returns `Result<_, AppError>` and the
/// `IntoResponse` impl renders a consistent `{ "error": "..." }` JSON body.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    BadRequest(String),

    #[error("unauthorized")]
    Unauthorized,

    #[error("not found")]
    NotFound,

    #[error("version conflict")]
    Conflict,

    /// 402 — a plan/usage limit was hit; the client shows an upgrade prompt.
    #[error("{0}")]
    PaymentRequired(String),

    // Reserved for explicit 413 responses; body-limit rejections already map
    // to 413 via the DefaultBodyLimit layer.
    #[allow(dead_code)]
    #[error("payload too large")]
    PayloadTooLarge,

    #[error(transparent)]
    Mongo(#[from] mongodb::error::Error),

    #[error(transparent)]
    Io(#[from] std::io::Error),

    #[error(transparent)]
    Json(#[from] serde_json::Error),

    #[error(transparent)]
    Other(#[from] anyhow::Error),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match &self {
            AppError::BadRequest(m) => (StatusCode::BAD_REQUEST, m.clone()),
            AppError::Unauthorized => (StatusCode::UNAUTHORIZED, self.to_string()),
            AppError::NotFound => (StatusCode::NOT_FOUND, self.to_string()),
            AppError::Conflict => (StatusCode::CONFLICT, self.to_string()),
            AppError::PaymentRequired(m) => (StatusCode::PAYMENT_REQUIRED, m.clone()),
            AppError::PayloadTooLarge => (StatusCode::PAYLOAD_TOO_LARGE, self.to_string()),
            AppError::Mongo(e) => {
                tracing::error!(error = %e, "mongodb error");
                (StatusCode::INTERNAL_SERVER_ERROR, "database error".to_string())
            }
            AppError::Io(e) => {
                tracing::error!(error = %e, "io error");
                (StatusCode::INTERNAL_SERVER_ERROR, "filesystem error".to_string())
            }
            AppError::Json(e) => {
                tracing::error!(error = %e, "json error");
                (StatusCode::INTERNAL_SERVER_ERROR, "serialization error".to_string())
            }
            AppError::Other(e) => {
                tracing::error!(error = %e, "internal error");
                (StatusCode::INTERNAL_SERVER_ERROR, "internal error".to_string())
            }
        };
        (status, Json(json!({ "error": message }))).into_response()
    }
}

pub type AppResult<T> = Result<T, AppError>;
