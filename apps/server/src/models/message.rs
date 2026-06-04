use serde::{Deserialize, Serialize};

/// A notification / inbox entry for a single user. `kind` is a stable string
/// the client switches on for icon and routing; `link` is an optional
/// destination (currently a folder id).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    #[serde(rename = "_id")]
    pub id: String,
    /// Recipient.
    pub user_id: String,
    /// Stable identifier, e.g. "folder.shared", "folder.unshared",
    /// "share.role_changed", "folder.renamed", "folder.deleted",
    /// "user.password_changed".
    pub kind: String,
    pub title: String,
    pub body: String,
    /// Optional destination — currently a folder id when applicable.
    #[serde(default)]
    pub link_folder_id: Option<String>,
    pub created_at: String,
    /// When the user marked it read; `None` = unread.
    #[serde(default)]
    pub read_at: Option<String>,
}
