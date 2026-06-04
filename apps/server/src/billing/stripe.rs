use std::time::{SystemTime, UNIX_EPOCH};

use hmac::{Hmac, Mac};
use serde::Deserialize;
use sha2::Sha256;

use crate::config::Config;
use crate::error::{AppError, AppResult};

type HmacSha256 = Hmac<Sha256>;

/// Minimal subset of a Stripe Customer needed by the rest of the codebase.
#[derive(Debug, Deserialize)]
pub struct StripeCustomer {
    pub id: String,
}

/// Minimal subset of a Stripe Checkout Session needed by the client — we hand
/// the `url` back so the desktop app can open it in the system browser.
#[derive(Debug, Deserialize)]
pub struct CheckoutSession {
    pub id: String,
    pub url: Option<String>,
}

/// Minimal subset of a Stripe Customer-Portal Session.
#[derive(Debug, Deserialize)]
pub struct PortalSession {
    pub id: String,
    pub url: String,
}

/// Trimmed Subscription — enough to derive a `License` row.
#[derive(Debug, Deserialize)]
pub struct StripeSubscription {
    pub id: String,
    pub customer: String,
    pub status: String,
    /// Unix epoch seconds. We convert to RFC 3339 when persisting.
    pub current_period_end: Option<i64>,
    pub items: SubscriptionItemsList,
    #[serde(default)]
    pub canceled_at: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct SubscriptionItemsList {
    pub data: Vec<SubscriptionItem>,
}

#[derive(Debug, Deserialize)]
pub struct SubscriptionItem {
    pub price: PriceRef,
}

#[derive(Debug, Deserialize)]
pub struct PriceRef {
    pub id: String,
}

/// Stripe webhook envelope. The `data.object` is event-shape-specific; we
/// re-parse just the bits we need rather than modelling every event.
#[derive(Debug, Deserialize)]
pub struct StripeEvent {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub data: EventData,
}

#[derive(Debug, Deserialize)]
pub struct EventData {
    pub object: serde_json::Value,
}

/// Thin client around the Stripe REST API. One instance per request is fine —
/// the underlying reqwest client is cheap to clone.
pub struct StripeClient {
    http: reqwest::Client,
    secret_key: String,
    return_url: String,
}

impl StripeClient {
    pub fn from_config(config: &Config) -> AppResult<Self> {
        if !config.billing_enabled() {
            return Err(AppError::BadRequest("billing is not configured on this server".into()));
        }
        Ok(Self {
            http: reqwest::Client::builder()
                .user_agent("OmniLog/0.1")
                .build()
                .map_err(|e| AppError::Other(anyhow::anyhow!(e)))?,
            secret_key: config.stripe_secret_key.clone(),
            return_url: if config.billing_return_url.is_empty() {
                format!("http://{}:{}", config.host, config.port)
            } else {
                config.billing_return_url.clone()
            },
        })
    }

    /// Create a Stripe Customer record. `email` may be empty; Stripe requires
    /// no fields but providing the username helps support look users up.
    pub async fn create_customer(&self, user_id: &str, username: &str) -> AppResult<StripeCustomer> {
        // Stripe accepts application/x-www-form-urlencoded with bracket
        // notation for nested fields. We only need a couple here.
        let body = vec![
            ("name", username.to_string()),
            ("metadata[user_id]", user_id.to_string()),
            ("metadata[username]", username.to_string()),
        ];
        self.post_form("https://api.stripe.com/v1/customers", &body).await
    }

    /// Create a Stripe Checkout Session for a subscription on `price_id`,
    /// charging the existing `customer_id`. Returns the session — the caller
    /// reads `.url` and redirects the browser there.
    pub async fn create_checkout_session(
        &self,
        customer_id: &str,
        price_id: &str,
    ) -> AppResult<CheckoutSession> {
        let success_url = format!("{}/billing/return?status=success", self.return_url.trim_end_matches('/'));
        let cancel_url = format!("{}/billing/return?status=cancel", self.return_url.trim_end_matches('/'));
        let body = vec![
            ("mode", "subscription".to_string()),
            ("customer", customer_id.to_string()),
            ("success_url", success_url),
            ("cancel_url", cancel_url),
            ("line_items[0][price]", price_id.to_string()),
            ("line_items[0][quantity]", "1".to_string()),
            // Allow the customer to manage promotion codes in Checkout.
            ("allow_promotion_codes", "true".to_string()),
        ];
        self.post_form("https://api.stripe.com/v1/checkout/sessions", &body).await
    }

    /// Create a Customer Portal session so the user can self-serve
    /// subscription changes (cancel, change plan, update card).
    pub async fn create_portal_session(&self, customer_id: &str) -> AppResult<PortalSession> {
        let body = vec![
            ("customer", customer_id.to_string()),
            ("return_url", self.return_url.clone()),
        ];
        self.post_form("https://api.stripe.com/v1/billing_portal/sessions", &body).await
    }

    /// Fetch a subscription by id (used by the webhook handler to resolve the
    /// full price/period info from the event payload).
    pub async fn get_subscription(&self, subscription_id: &str) -> AppResult<StripeSubscription> {
        let url = format!("https://api.stripe.com/v1/subscriptions/{subscription_id}");
        let res = self
            .http
            .get(&url)
            .basic_auth(&self.secret_key, Some(""))
            .send()
            .await
            .map_err(|e| AppError::Other(anyhow::anyhow!(e)))?;
        if !res.status().is_success() {
            let status = res.status();
            let body = res.text().await.unwrap_or_default();
            tracing::error!(%status, %body, "stripe get_subscription failed");
            return Err(AppError::Other(anyhow::anyhow!("stripe error ({status})")));
        }
        res.json::<StripeSubscription>()
            .await
            .map_err(|e| AppError::Other(anyhow::anyhow!(e)))
    }

    async fn post_form<T: serde::de::DeserializeOwned>(
        &self,
        url: &str,
        form: &[(&str, String)],
    ) -> AppResult<T> {
        let res = self
            .http
            .post(url)
            .basic_auth(&self.secret_key, Some(""))
            .form(form)
            .send()
            .await
            .map_err(|e| AppError::Other(anyhow::anyhow!(e)))?;
        if !res.status().is_success() {
            let status = res.status();
            let body = res.text().await.unwrap_or_default();
            tracing::error!(%status, %url, %body, "stripe post failed");
            return Err(AppError::Other(anyhow::anyhow!("stripe error ({status})")));
        }
        res.json::<T>()
            .await
            .map_err(|e| AppError::Other(anyhow::anyhow!(e)))
    }
}

/// Verify a Stripe webhook signature against the configured webhook secret.
///
/// Stripe sends a `Stripe-Signature` header of the form
/// `t=<timestamp>,v1=<hex hmac>,v1=<another hmac>,...`
///
/// We recompute `HMAC-SHA256(secret, "<timestamp>.<raw body>")` and compare
/// against any v1 entry in constant time. Events older than `tolerance_seconds`
/// are rejected to limit replay risk.
pub fn verify_webhook_signature(
    payload: &[u8],
    header: &str,
    secret: &str,
    tolerance_seconds: i64,
) -> AppResult<StripeEvent> {
    if secret.is_empty() {
        return Err(AppError::BadRequest("webhook secret not configured".into()));
    }
    let (timestamp, signatures) = parse_sig_header(header)
        .ok_or_else(|| AppError::BadRequest("invalid Stripe-Signature header".into()))?;

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    if (now - timestamp).abs() > tolerance_seconds {
        return Err(AppError::BadRequest("webhook timestamp out of tolerance".into()));
    }

    let mut mac = HmacSha256::new_from_slice(secret.as_bytes())
        .map_err(|e| AppError::Other(anyhow::anyhow!(e.to_string())))?;
    mac.update(format!("{timestamp}.").as_bytes());
    mac.update(payload);
    let expected = mac.finalize().into_bytes();
    let expected_hex = hex::encode(expected);

    let ok = signatures.iter().any(|sig| constant_time_eq(sig, &expected_hex));
    if !ok {
        return Err(AppError::Unauthorized);
    }

    serde_json::from_slice::<StripeEvent>(payload)
        .map_err(|e| AppError::Other(anyhow::anyhow!(e)))
}

fn parse_sig_header(header: &str) -> Option<(i64, Vec<String>)> {
    let mut t: Option<i64> = None;
    let mut sigs: Vec<String> = Vec::new();
    for part in header.split(',') {
        let mut kv = part.splitn(2, '=');
        let k = kv.next()?.trim();
        let v = kv.next()?.trim();
        match k {
            "t" => t = v.parse::<i64>().ok(),
            "v1" => sigs.push(v.to_string()),
            _ => {}
        }
    }
    Some((t?, sigs))
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

/// Map a Stripe Price id back to one of our plan names. Returns `None` if the
/// price isn't one we sell (e.g. an old discontinued plan still attached to a
/// grandfathered subscription).
pub fn plan_for_price(config: &Config, price_id: &str) -> Option<&'static str> {
    if !config.stripe_price_pro.is_empty() && config.stripe_price_pro == price_id {
        Some("pro")
    } else if !config.stripe_price_team.is_empty() && config.stripe_price_team == price_id {
        Some("team")
    } else {
        None
    }
}

/// Convert a unix-epoch-seconds value into RFC 3339 (UTC, milliseconds).
pub fn epoch_to_rfc3339(secs: i64) -> Option<String> {
    chrono::DateTime::<chrono::Utc>::from_timestamp(secs, 0)
        .map(|d| d.to_rfc3339_opts(chrono::SecondsFormat::Millis, true))
}
