//! Per-IP sliding-window rate limiter. Applied to public auth endpoints
//! (login, register, forgot-password) to prevent brute-force and abuse.

use std::collections::HashMap;
use std::net::IpAddr;
use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::extract::{ConnectInfo, Request, State};
use axum::http::StatusCode;
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};
use tokio::sync::Mutex;

use crate::state::AppState;

/// Shared rate-limiter state. Multiple limiters can coexist (e.g. one strict
/// limiter for auth endpoints, a looser one for general API calls).
#[derive(Clone)]
pub struct RateLimiter {
    inner: Arc<Inner>,
}

struct Inner {
    window: Duration,
    max_requests: usize,
    buckets: Mutex<HashMap<IpAddr, Vec<Instant>>>,
}

impl RateLimiter {
    pub fn new(window_secs: u64, max_requests: usize) -> Self {
        Self {
            inner: Arc::new(Inner {
                window: Duration::from_secs(window_secs),
                max_requests,
                buckets: Mutex::new(HashMap::new()),
            }),
        }
    }

    /// Returns `true` if the request is allowed, `false` if rate-limited.
    pub async fn check(&self, ip: IpAddr) -> bool {
        let now = Instant::now();
        let mut buckets = self.inner.buckets.lock().await;
        let timestamps = buckets.entry(ip).or_default();
        // Evict stale entries.
        timestamps.retain(|t| now.duration_since(*t) < self.inner.window);
        if timestamps.len() >= self.inner.max_requests {
            false
        } else {
            timestamps.push(now);
            true
        }
    }

    /// Periodically purge entries for IPs that haven't been seen recently.
    /// Call from a background task every ~60s.
    pub async fn cleanup(&self) {
        let now = Instant::now();
        let mut buckets = self.inner.buckets.lock().await;
        buckets.retain(|_, ts| {
            ts.retain(|t| now.duration_since(*t) < self.inner.window);
            !ts.is_empty()
        });
    }
}

/// Extract the client IP. Checks `X-Forwarded-For` first (for reverse-proxy
/// setups), then falls back to the peer socket address from `ConnectInfo`.
fn client_ip(req: &Request) -> Option<IpAddr> {
    // X-Forwarded-For: client, proxy1, proxy2 — take the leftmost.
    if let Some(xff) = req.headers().get("x-forwarded-for") {
        if let Ok(s) = xff.to_str() {
            if let Some(first) = s.split(',').next() {
                if let Ok(ip) = first.trim().parse::<IpAddr>() {
                    return Some(ip);
                }
            }
        }
    }
    // Fall back to ConnectInfo if the server was started with
    // `into_make_service_with_connect_info`.
    req.extensions()
        .get::<ConnectInfo<std::net::SocketAddr>>()
        .map(|ci| ci.0.ip())
}

/// Axum middleware for the **auth** rate limiter (strict: 10 req / 60s).
pub async fn rate_limit_auth(
    State(state): State<AppState>,
    req: Request,
    next: Next,
) -> Response {
    let ip = client_ip(&req).unwrap_or(IpAddr::from([127, 0, 0, 1]));
    if !state.auth_limiter.check(ip).await {
        return (
            StatusCode::TOO_MANY_REQUESTS,
            axum::Json(serde_json::json!({ "error": "too many requests, try again later" })),
        )
            .into_response();
    }
    next.run(req).await
}
