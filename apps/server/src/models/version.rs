use serde::{Deserialize, Serialize};

/// A historical snapshot of an entry, captured before it is overwritten. Used
/// by the version manager to list history and roll back.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Version {
    #[serde(rename = "_id")]
    pub id: String,
    pub entry_id: String,
    pub user_id: String,
    /// The entry `version` number this snapshot represents.
    pub version: i64,
    pub title: String,
    pub date: String,
    pub content_json: serde_json::Value,
    pub content_text: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub content_html: Option<String>,
    pub tags: Vec<String>,
    /// When the snapshot was taken.
    pub created_at: String,
    pub device_id: String,
    /// Editor mode at the time of the snapshot. Defaults to "rich" for legacy
    /// snapshots captured before this field existed.
    #[serde(default = "default_mode")]
    pub mode: String,
}

fn default_mode() -> String {
    "rich".to_string()
}
