use serde::{Deserialize, Serialize};

/// Per-user license / subscription state. Stored only when this instance is
/// running as the official hosted service (`Config::billing_enabled()` is
/// true); self-hosted instances neither read nor write this collection.
///
/// We key by `user_id` rather than using a separate `_id` so there's exactly
/// one license row per user. `stripe_customer_id` is also indexed for fast
/// webhook routing (Stripe events are scoped to customers, not users).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct License {
    /// Mongo `_id` — same value as `user_id`. Lets us upsert without an
    /// extra index lookup.
    #[serde(rename = "_id")]
    pub user_id: String,
    /// "free" | "pro" | "team".
    pub plan: String,
    /// Stripe subscription status: "active" | "trialing" | "past_due" |
    /// "canceled" | "incomplete" | … verbatim from Stripe. Free users
    /// report "active" so the client can treat status === "active" uniformly.
    pub status: String,
    /// ISO timestamp the current billing period ends at. Free / lifetime
    /// users leave this `None`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub current_period_end: Option<String>,
    /// Stripe Customer id (`cus_…`). Set on first Checkout session creation.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stripe_customer_id: Option<String>,
    /// Stripe Subscription id (`sub_…`). Set when an active subscription
    /// exists; cleared on cancellation.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub subscription_id: Option<String>,
    /// Plan-derived feature flags. The server fills these in from `plan` on
    /// each upsert so callers can switch on them directly without re-deriving.
    #[serde(default)]
    pub features: Vec<String>,
    pub updated_at: String,
}

impl License {
    /// The implicit free license returned by `/api/auth/license` when the
    /// user has no stored row but billing is enabled (e.g. a new signup that
    /// hasn't reached Stripe Checkout yet).
    pub fn default_free(user_id: &str, now: &str) -> Self {
        License {
            user_id: user_id.to_string(),
            plan: "free".to_string(),
            status: "active".to_string(),
            current_period_end: None,
            stripe_customer_id: None,
            subscription_id: None,
            features: features_for_plan("free"),
            updated_at: now.to_string(),
        }
    }

    pub fn with_plan(mut self, plan: &str) -> Self {
        self.plan = plan.to_string();
        self.features = features_for_plan(plan);
        self
    }

    /// A permanently-unlimited license, returned for accounts listed in
    /// `SUPERUSER_USERNAMES`. Status is "active", no period end (never
    /// expires), all `team` features unlocked, plus a "superuser" tag
    /// the client can match on. Carries no Stripe customer or subscription
    /// id; superusers are never billed.
    pub fn superuser_unlimited(user_id: &str, now: &str) -> Self {
        let mut features = features_for_plan("team");
        features.push("superuser".to_string());
        features.push("unlimited".to_string());
        License {
            user_id: user_id.to_string(),
            plan: "team".to_string(),
            status: "active".to_string(),
            current_period_end: None,
            stripe_customer_id: None,
            subscription_id: None,
            features,
            updated_at: now.to_string(),
        }
    }
}

/// Plan → feature flags. Kept here (not in Stripe) so the client doesn't have
/// to round-trip the price object to know what's unlocked.
pub fn features_for_plan(plan: &str) -> Vec<String> {
    match plan {
        "pro" => vec![
            "cloud-backup".to_string(),
            "version-history-unlimited".to_string(),
            "image-storage-extended".to_string(),
        ],
        "team" => vec![
            "cloud-backup".to_string(),
            "version-history-unlimited".to_string(),
            "image-storage-extended".to_string(),
            "team-sharing".to_string(),
            "audit-log".to_string(),
        ],
        _ => vec![],
    }
}
