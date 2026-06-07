//! Plan usage limits and feature gates — the single source of truth for what
//! each plan can do. Modeled on ThreadLedger's licensing system: limits live
//! server-side, the client cannot bypass them, and exceeding one returns 402 so
//! the client can show an upgrade prompt.
//!
//! Only enforced on the official hosted deployment (`billing_enabled()`).
//! Self-hosted instances are always unlimited.

use crate::auth::AuthUser;
use crate::error::AppResult;
use crate::state::AppState;

#[derive(Debug, Clone, Copy)]
pub struct PlanLimits {
    /// Max non-deleted entries. `None` = unlimited.
    pub max_entries: Option<u64>,
    /// Max folders. `None` = unlimited.
    pub max_folders: Option<u64>,
    /// Image upload allowed.
    pub images: bool,
    /// Export allowed.
    pub export: bool,
    /// Restoring a past version allowed.
    pub version_restore: bool,
}

impl PlanLimits {
    pub const UNLIMITED: PlanLimits = PlanLimits {
        max_entries: None,
        max_folders: None,
        images: true,
        export: true,
        version_restore: true,
    };
}

/// Free-tier caps. Generous enough to be useful, limited enough to motivate Pro.
pub const FREE: PlanLimits = PlanLimits {
    max_entries: Some(50),
    max_folders: Some(10),
    images: false,
    export: false,
    version_restore: false,
};

pub fn limits_for_plan(plan: &str) -> PlanLimits {
    match plan {
        "pro" | "team" | "lifetime" | "gift" | "dev" => PlanLimits::UNLIMITED,
        _ => FREE,
    }
}

/// The caller's effective limits. Always unlimited for self-hosted instances
/// (billing disabled) and for staff (admin/owner). Otherwise we look up the
/// stored license (defaulting to free when there's no row yet).
pub async fn effective_limits(state: &AppState, auth: &AuthUser) -> AppResult<PlanLimits> {
    if !state.config.billing_enabled() || auth.is_admin() || auth.is_owner() {
        return Ok(PlanLimits::UNLIMITED);
    }
    let plan = state
        .storage
        .get_license(&auth.id)
        .await?
        .map(|l| l.plan)
        .unwrap_or_else(|| "free".to_string());
    Ok(limits_for_plan(&plan))
}
