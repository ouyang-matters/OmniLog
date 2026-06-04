use serde::{Deserialize, Serialize};

/// A work-log entry as stored in MongoDB and returned over the API. Field names
/// are camelCase to match `@omnilog/shared`'s `WorklogEntry`. `_id` is a UUID
/// string (not an ObjectId) so client and server share the same id space.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    #[serde(rename = "_id")]
    pub id: String,
    pub user_id: String,
    /// Folder this entry lives in. `None` = root.
    #[serde(default)]
    pub folder_id: Option<String>,
    pub title: String,
    pub date: String,
    pub content_json: serde_json::Value,
    pub content_text: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub content_html: Option<String>,
    pub tags: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub deleted_at: Option<String>,
    pub version: i64,
    pub sync_status: String,
    pub device_id: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub content_hash: Option<String>,
    /// Editor mode this entry was authored in. `"rich"` (TipTap, default for
    /// backward-compat), `"latex"` (raw LaTeX source) or `"markdown"`
    /// (Markdown source). For non-rich modes `content_json` is unused — the
    /// canonical source lives in `content_text`.
    #[serde(default = "default_mode")]
    pub mode: String,
}

fn default_mode() -> String {
    "rich".to_string()
}

/// Body for POST /api/entries.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateEntryInput {
    #[serde(default)]
    pub folder_id: Option<String>,
    #[serde(default)]
    pub title: String,
    pub date: String,
    pub content_json: serde_json::Value,
    #[serde(default)]
    pub content_text: String,
    #[serde(default)]
    pub content_html: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    pub device_id: String,
    #[serde(default)]
    pub content_hash: Option<String>,
    /// Optional. Defaults to "rich" if omitted.
    #[serde(default)]
    pub mode: Option<String>,
}

/// Body for PATCH /api/entries/:id. All fields optional (partial update).
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateEntryInput {
    /// Move to a folder. Empty string moves to root.
    pub folder_id: Option<String>,
    pub title: Option<String>,
    pub date: Option<String>,
    pub content_json: Option<serde_json::Value>,
    pub content_text: Option<String>,
    pub content_html: Option<String>,
    pub tags: Option<Vec<String>>,
    pub device_id: Option<String>,
    pub content_hash: Option<String>,
    pub mode: Option<String>,
    /// Optimistic-concurrency guard; if present and != stored version -> 409.
    pub base_version: Option<i64>,
}
