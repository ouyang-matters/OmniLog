use serde::{Deserialize, Serialize};

/// A user account. `password_hash` is never serialized to API responses.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct User {
    #[serde(rename = "_id")]
    pub id: String,
    pub username: String,
    /// Internal only. API responses use `PublicUser`, which omits this.
    pub password_hash: String,
    /// "owner" (server operator, highest privilege) | "admin" | "user".
    /// Older user rows that predate this field default to "user".
    pub role: String,
    pub created_at: String,
    /// Free-form display name. Falls back to `username` when unset.
    #[serde(default)]
    pub display_name: Option<String>,
    /// Avatar as an inline `data:image/...;base64,…` URL. Capped at ~256 KB
    /// post-encoding by the upload endpoint. Stored inline so it's served with
    /// the user record (fine for small personal deployments).
    #[serde(default)]
    pub avatar_data_url: Option<String>,
    /// Optional contact email. Display-only on the client side; the server
    /// does not currently send email itself. Useful for account recovery
    /// flows and for the operator to identify accounts at a glance.
    #[serde(default)]
    pub email: Option<String>,
}

impl User {
    pub fn is_owner(&self) -> bool {
        self.role == "owner"
    }
}

/// Public view of a user (no secrets).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicUser {
    pub id: String,
    pub username: String,
    pub role: String,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar_data_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub email: Option<String>,
}

impl From<&User> for PublicUser {
    fn from(u: &User) -> Self {
        PublicUser {
            id: u.id.clone(),
            username: u.username.clone(),
            role: u.role.clone(),
            created_at: u.created_at.clone(),
            display_name: u.display_name.clone(),
            avatar_data_url: u.avatar_data_url.clone(),
            email: u.email.clone(),
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct LoginInput {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateUserInput {
    pub username: String,
    pub password: String,
    #[serde(default)]
    pub role: Option<String>,
    #[serde(default)]
    pub display_name: Option<String>,
    #[serde(default)]
    pub email: Option<String>,
}

/// Admin-side patch of another user.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateUserInput {
    /// New role: "owner", "admin" or "user". Owner-only.
    pub role: Option<String>,
    /// Admin password reset. Empty/absent = no change.
    pub password: Option<String>,
    /// Optional display-name override (admins/owner editing another user).
    pub display_name: Option<String>,
    /// Optional email override.
    pub email: Option<String>,
}

/// Self-service profile update — anything a user is allowed to change about
/// themselves. Everyone (including non-bootstrap users) can use this.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMeInput {
    pub display_name: Option<String>,
    /// Set to `Some("")` to clear the avatar; `Some(data_url)` to set it;
    /// absent to leave unchanged.
    pub avatar_data_url: Option<String>,
    /// Set to `Some("")` to clear, `Some("...")` to set, absent to leave.
    pub email: Option<String>,
}

/// Self-service password change. The bootstrap API_TOKEN principal has no
/// stored password so the route rejects them — they rotate the env var.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangePasswordInput {
    pub old_password: String,
    pub new_password: String,
}
