//! Billing endpoints — only meaningful on the official hosted deployment.
//! Self-hosted instances leave `STRIPE_SECRET_KEY` empty and every handler
//! here short-circuits to 404 so the client (which treats 404 as "no
//! license info available") seamlessly falls back to the free experience.

use axum::body::Bytes;
use axum::extract::State;
use axum::http::HeaderMap;
use axum::{Extension, Json};
use serde::{Deserialize, Serialize};

use crate::auth::AuthUser;
use crate::billing::stripe::{
    epoch_to_rfc3339, plan_for_price, verify_webhook_signature, StripeClient, StripeSubscription,
};
use crate::error::{AppError, AppResult};
use crate::models::license::{features_for_plan, License};
use crate::models::now_rfc3339;
use crate::models::DEFAULT_USER_ID;
use crate::state::AppState;

const WEBHOOK_TOLERANCE_SECS: i64 = 300; // 5 minutes — Stripe's recommended value

fn require_billing(state: &AppState) -> AppResult<()> {
    if !state.config.billing_enabled() {
        // 404 rather than 403 so the client treats this server as "no license
        // info available" and falls back to free / self-host behaviour.
        return Err(AppError::NotFound);
    }
    Ok(())
}

/// Look up (or create + persist) a license row for the caller. The free
/// default is returned without persisting — we don't write rows until the
/// user actually interacts with Stripe.
async fn ensure_license_row(state: &AppState, user_id: &str) -> AppResult<License> {
    if let Some(l) = state.storage.get_license(user_id).await? {
        return Ok(l);
    }
    Ok(License::default_free(user_id, &now_rfc3339()))
}

/// Ensure a Stripe customer exists for this user and return its id. Creates
/// one on first call and persists it onto the license row.
async fn ensure_stripe_customer(
    state: &AppState,
    auth: &AuthUser,
    stripe: &StripeClient,
) -> AppResult<(License, String)> {
    let mut license = ensure_license_row(state, &auth.id).await?;
    if let Some(cid) = license.stripe_customer_id.clone() {
        return Ok((license, cid));
    }
    let customer = stripe.create_customer(&auth.id, &auth.username).await?;
    license.stripe_customer_id = Some(customer.id.clone());
    license.updated_at = now_rfc3339();
    state.storage.upsert_license(&license).await?;
    Ok((license, customer.id))
}

/// GET /api/auth/license — returns the caller's license + entitlement so the
/// client can switch on plan/features. On a billing-disabled server this
/// 404s; the client treats that as "no license info".
pub async fn get_license(
    State(state): State<AppState>,
    Extension(auth): Extension<AuthUser>,
) -> AppResult<Json<License>> {
    require_billing(&state)?;
    if auth.id == DEFAULT_USER_ID {
        // Bootstrap principal isn't a real user — no Stripe customer ever
        // gets created for them; return an implicit free license.
        return Ok(Json(License::default_free(&auth.id, &now_rfc3339())));
    }
    Ok(Json(ensure_license_row(&state, &auth.id).await?))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckoutInput {
    /// "pro" | "team". Mapped to a Stripe Price id via env config.
    pub plan: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckoutResponse {
    /// URL the client should open in the system browser.
    pub url: String,
}

/// POST /api/billing/checkout — create a Stripe Checkout Session for the
/// caller and the chosen plan, returning the URL to open.
pub async fn checkout(
    State(state): State<AppState>,
    Extension(auth): Extension<AuthUser>,
    Json(input): Json<CheckoutInput>,
) -> AppResult<Json<CheckoutResponse>> {
    require_billing(&state)?;
    if auth.id == DEFAULT_USER_ID {
        return Err(AppError::BadRequest(
            "the bootstrap admin doesn't support subscriptions — create a real user first".into(),
        ));
    }
    let price_id = state
        .config
        .stripe_price_for(input.plan.as_str())
        .ok_or_else(|| AppError::BadRequest("unknown plan or price not configured".into()))?
        .to_string();
    let stripe = StripeClient::from_config(&state.config)?;
    let (_, customer_id) = ensure_stripe_customer(&state, &auth, &stripe).await?;
    let session = stripe.create_checkout_session(&customer_id, &price_id).await?;
    let url = session
        .url
        .ok_or_else(|| AppError::Other(anyhow::anyhow!("Stripe returned no checkout URL")))?;
    Ok(Json(CheckoutResponse { url }))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortalResponse {
    pub url: String,
}

/// POST /api/billing/portal — create a Customer Portal session so the user
/// can self-manage their subscription (cancel, swap plan, update card).
pub async fn portal(
    State(state): State<AppState>,
    Extension(auth): Extension<AuthUser>,
) -> AppResult<Json<PortalResponse>> {
    require_billing(&state)?;
    let license = state.storage.get_license(&auth.id).await?.ok_or_else(|| {
        AppError::BadRequest("you don't have a Stripe customer yet — start a checkout first".into())
    })?;
    let customer_id = license.stripe_customer_id.ok_or_else(|| {
        AppError::BadRequest("you don't have a Stripe customer yet — start a checkout first".into())
    })?;
    let stripe = StripeClient::from_config(&state.config)?;
    let session = stripe.create_portal_session(&customer_id).await?;
    Ok(Json(PortalResponse { url: session.url }))
}

/// POST /api/billing/webhook — receive Stripe events. Signature-verified
/// against `STRIPE_WEBHOOK_SECRET`. Updates the matching License row when a
/// subscription is created, updated, or deleted.
///
/// IMPORTANT: this handler reads the raw body bytes (Stripe signs the exact
/// bytes received) — never let a JSON extractor parse it first.
pub async fn webhook(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> AppResult<Json<serde_json::Value>> {
    // Webhook is public (Stripe calls it with no Authorization header), but
    // it MUST stay 404 on billing-disabled servers so misconfigured proxies
    // can't leak the route.
    require_billing(&state)?;

    let sig = headers
        .get("stripe-signature")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| AppError::BadRequest("missing Stripe-Signature header".into()))?;
    let event = verify_webhook_signature(
        &body,
        sig,
        &state.config.stripe_webhook_secret,
        WEBHOOK_TOLERANCE_SECS,
    )?;

    match event.kind.as_str() {
        // Subscription lifecycle — re-fetch the canonical subscription so we
        // don't have to model the entire event payload variation.
        "customer.subscription.created"
        | "customer.subscription.updated"
        | "customer.subscription.deleted"
        | "checkout.session.completed" => {
            let subscription_id = pluck_subscription_id(&event.data.object);
            if let Some(subscription_id) = subscription_id {
                let stripe = StripeClient::from_config(&state.config)?;
                let sub = stripe.get_subscription(&subscription_id).await?;
                apply_subscription_to_license(&state, &sub).await?;
            }
        }
        // Other events (invoice.paid, invoice.payment_failed, customer.created,
        // etc.) are acknowledged but not acted on yet.
        _ => {
            tracing::debug!(kind = %event.kind, id = %event.id, "stripe event ignored");
        }
    }

    Ok(Json(serde_json::json!({ "received": true })))
}

/// Pluck the subscription id out of a Stripe event payload. Checkout sessions
/// carry it under `subscription`; subscription events ARE the subscription
/// object, so use its `id`.
fn pluck_subscription_id(obj: &serde_json::Value) -> Option<String> {
    obj.get("subscription")
        .and_then(|v| v.as_str())
        .or_else(|| obj.get("object").and_then(|o| {
            // Subscription object itself: { object: "subscription", id: "sub_..." }
            if o.as_str() == Some("subscription") {
                obj.get("id").and_then(|v| v.as_str())
            } else {
                None
            }
        }))
        .or_else(|| {
            // Fallback: anything with an `id` starting with "sub_".
            obj.get("id")
                .and_then(|v| v.as_str())
                .filter(|s| s.starts_with("sub_"))
        })
        .map(|s| s.to_string())
}

/// Reconcile a Stripe Subscription with our License row. Picks the matching
/// plan from the configured price ids; falls back to "free" when the price
/// isn't one we sell or the subscription was canceled.
async fn apply_subscription_to_license(
    state: &AppState,
    sub: &StripeSubscription,
) -> AppResult<()> {
    let existing = state
        .storage
        .get_license_by_customer(&sub.customer)
        .await?;
    let user_id = match existing.as_ref() {
        Some(l) => l.user_id.clone(),
        None => {
            tracing::warn!(
                customer = %sub.customer,
                subscription = %sub.id,
                "received subscription event for unknown customer — no license row to update",
            );
            return Ok(());
        }
    };

    // Pick a plan based on the first subscription item's price. Stripe only
    // returns multiple items on combined products; we sell one product per
    // sub today, so item[0] is canonical.
    let price_id = sub.items.data.first().map(|it| it.price.id.as_str());
    let canceled = matches!(sub.status.as_str(), "canceled" | "incomplete_expired" | "unpaid");
    let plan: &str = if canceled {
        "free"
    } else {
        price_id
            .and_then(|p| plan_for_price(&state.config, p))
            .unwrap_or("free")
    };

    let mut updated = existing.unwrap_or_else(|| License::default_free(&user_id, &now_rfc3339()));
    updated.plan = plan.to_string();
    updated.features = features_for_plan(plan);
    updated.status = sub.status.clone();
    updated.subscription_id = if canceled { None } else { Some(sub.id.clone()) };
    updated.current_period_end = sub.current_period_end.and_then(epoch_to_rfc3339);
    updated.updated_at = now_rfc3339();
    state.storage.upsert_license(&updated).await?;

    // Surface the change in the user's notifications inbox.
    let _ = enqueue_billing_notice(state, &user_id, plan, sub.status.as_str()).await;
    Ok(())
}

async fn enqueue_billing_notice(
    state: &AppState,
    user_id: &str,
    plan: &str,
    status: &str,
) -> AppResult<()> {
    use crate::models::message::Message;
    use crate::models::new_id;
    let (title, body) = match status {
        "active" | "trialing" => (
            format!("Subscription active — {}", plan),
            format!("Your subscription is now active on the {plan} plan."),
        ),
        "past_due" => (
            "Payment past due".to_string(),
            "Your latest payment didn't go through. Update your card in the customer portal."
                .to_string(),
        ),
        "canceled" | "incomplete_expired" | "unpaid" => (
            "Subscription canceled".to_string(),
            "Your subscription was canceled. You're back on the free plan.".to_string(),
        ),
        _ => return Ok(()),
    };
    let msg = Message {
        id: new_id(),
        user_id: user_id.to_string(),
        kind: "billing.subscription_changed".to_string(),
        title,
        body,
        link_folder_id: None,
        created_at: now_rfc3339(),
        read_at: None,
    };
    state.storage.insert_message(&msg).await
}
