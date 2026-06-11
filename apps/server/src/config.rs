use std::path::{Path, PathBuf};

use anyhow::{Context, Result};

/// Runtime configuration, sourced entirely from environment variables (.env).
/// Every path is built with `PathBuf` so it is correct on Windows and Linux -
/// there are no hard-coded `/var/...` paths or drive letters anywhere.
#[derive(Debug, Clone)]
pub struct Config {
    pub port: u16,
    pub host: String,
    pub mongodb_uri: String,
    pub mongodb_db: String,
    pub data_dir: PathBuf,
    pub api_token: String,
    pub cors_origin: String,
    pub admin_username: String,
    pub admin_password: String,

    // --- Stripe / billing ---
    // All optional. When STRIPE_SECRET_KEY is empty, billing is disabled and
    // every /api/billing/* route 404s (self-hosted instances see no
    // difference). Set these on the official-hosted deployment.
    pub stripe_secret_key: String,
    pub stripe_webhook_secret: String,
    pub stripe_price_pro: String,
    pub stripe_price_team: String,
    /// Base URL clients are redirected back to after Stripe Checkout (success
    /// and cancel both bounce here). Defaults to the OmniLog API origin.
    pub billing_return_url: String,

    /// Comma-separated list of superuser usernames. Anyone whose login
    /// username appears here is treated as a permanently-unlimited account:
    /// the billing layer reports an unexpiring `team` license for them and
    /// never charges Stripe, even on an official deployment. The first
    /// superuser in the list is the one the server seeds at first boot
    /// (with `superuser_email`, `superuser_display_name`, `superuser_password`).
    /// Empty means no superusers configured.
    pub superuser_usernames: Vec<String>,
    pub superuser_email: String,
    pub superuser_display_name: String,
    pub superuser_password: String,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        let port = env_or("PORT", "3000")
            .parse::<u16>()
            .context("PORT must be a valid port number")?;
        let host = env_or("HOST", "0.0.0.0");
        let mongodb_uri = env_or("MONGODB_URI", "mongodb://127.0.0.1:27017");
        let mongodb_db = env_or("MONGODB_DB", "omnilog");
        let data_dir = PathBuf::from(env_or("DATA_DIR", "./server_data"));
        let api_token = env_or("API_TOKEN", "change-me");
        let cors_origin = env_or("CORS_ORIGIN", "*");
        let admin_username = env_or("ADMIN_USERNAME", "admin");
        let admin_password = env_or("ADMIN_PASSWORD", "admin");

        let stripe_secret_key = env_or("STRIPE_SECRET_KEY", "");
        let stripe_webhook_secret = env_or("STRIPE_WEBHOOK_SECRET", "");
        let stripe_price_pro = env_or("STRIPE_PRICE_PRO", "");
        let stripe_price_team = env_or("STRIPE_PRICE_TEAM", "");
        let billing_return_url = env_or("BILLING_RETURN_URL", "");

        let superuser_usernames: Vec<String> = env_or("SUPERUSER_USERNAMES", "")
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        let superuser_email = env_or("SUPERUSER_EMAIL", "");
        let superuser_display_name = env_or("SUPERUSER_DISPLAY_NAME", "");
        let superuser_password = env_or("SUPERUSER_PASSWORD", "");

        Ok(Self {
            port,
            host,
            mongodb_uri,
            mongodb_db,
            data_dir,
            api_token,
            cors_origin,
            admin_username,
            admin_password,
            stripe_secret_key,
            stripe_webhook_secret,
            stripe_price_pro,
            stripe_price_team,
            billing_return_url,
            superuser_usernames,
            superuser_email,
            superuser_display_name,
            superuser_password,
        })
    }

    /// True when `username` is on the superuser list. Case-sensitive match
    /// so we don't accidentally match similar-looking usernames.
    pub fn is_superuser(&self, username: &str) -> bool {
        self.superuser_usernames.iter().any(|u| u == username)
    }

    /// True when this instance is configured to act as an official, paid
    /// service. Self-hosted deployments leave STRIPE_SECRET_KEY empty and
    /// every billing route 404s.
    pub fn billing_enabled(&self) -> bool {
        !self.stripe_secret_key.trim().is_empty()
    }

    /// Resolve a Stripe Price id from a plan name. Returns None for `free`
    /// (which has no Stripe product) or when the env var for that plan was
    /// not configured.
    pub fn stripe_price_for(&self, plan: &str) -> Option<&str> {
        let v = match plan {
            "pro" => &self.stripe_price_pro,
            "team" => &self.stripe_price_team,
            _ => return None,
        };
        Some(v.as_str()).filter(|s| !s.is_empty())
    }

    pub fn assets_dir(&self) -> PathBuf {
        self.data_dir.join("assets").join("images")
    }

    pub fn exports_dir(&self) -> PathBuf {
        self.data_dir.join("exports")
    }

    pub fn logs_dir(&self) -> PathBuf {
        self.data_dir.join("logs")
    }

    /// Create the DATA_DIR tree (assets/exports/logs) up front so request
    /// handlers can assume the directories exist. Cross-platform.
    pub fn ensure_dirs(&self) -> Result<()> {
        for dir in [self.assets_dir(), self.exports_dir(), self.logs_dir()] {
            std::fs::create_dir_all(&dir)
                .with_context(|| format!("failed to create data directory {}", dir.display()))?;
        }
        Ok(())
    }

    /// True when the server should use the built-in embedded (file-backed)
    /// storage instead of MongoDB. This is what powers the desktop client's
    /// "one-click local server" - no database install required. Triggered by an
    /// empty `MONGODB_URI` (or the sentinels `embedded` / `local` / `none`).
    pub fn use_embedded(&self) -> bool {
        let u = self.mongodb_uri.trim().to_lowercase();
        u.is_empty() || u == "embedded" || u == "local" || u == "none"
    }

    /// Parse CORS_ORIGIN into an explicit allowlist, or `None` to allow any.
    pub fn cors_origins(&self) -> Option<Vec<String>> {
        let trimmed = self.cors_origin.trim();
        if trimmed == "*" || trimmed.is_empty() {
            None
        } else {
            Some(
                trimmed
                    .split(',')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect(),
            )
        }
    }
}

/// Resolve a storage path relative to DATA_DIR into an absolute filesystem path,
/// rejecting traversal outside DATA_DIR.
pub fn resolve_in_data_dir(data_dir: &Path, relative: &str) -> Option<PathBuf> {
    let rel = Path::new(relative);
    if rel.components().any(|c| matches!(c, std::path::Component::ParentDir)) {
        return None;
    }
    Some(data_dir.join(rel))
}

fn env_or(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_string())
}
