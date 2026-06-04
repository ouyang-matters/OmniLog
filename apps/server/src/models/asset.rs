use serde::{Deserialize, Serialize};

/// An uploaded asset (image) as stored in MongoDB. The binary lives on disk
/// under DATA_DIR; only metadata is persisted here. `storagePath` is always
/// DATA_DIR-relative and uses forward slashes for portability.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Asset {
    #[serde(rename = "_id")]
    pub id: String,
    pub user_id: String,
    pub entry_id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub file_name: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub original_name: Option<String>,
    pub mime_type: String,
    pub size: i64,
    pub storage_path: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub public_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub width: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub height: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub caption: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub content_hash: Option<String>,
}
