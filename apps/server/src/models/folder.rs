use serde::{Deserialize, Serialize};

/// A folder / sub-project. Folders nest via `parent_id` (None = top level).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Folder {
    #[serde(rename = "_id")]
    pub id: String,
    pub user_id: String,
    #[serde(default)]
    pub parent_id: Option<String>,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateFolderInput {
    pub name: String,
    #[serde(default)]
    pub parent_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateFolderInput {
    pub name: Option<String>,
    /// Move under another folder. Empty string = move to top level.
    pub parent_id: Option<String>,
}

/// Augmented folder shape returned by `GET /api/folders`. Adds the caller's
/// effective role and (for shared folders) the owning user's username, so the
/// client can show "shared with you" badges and hide owner-only controls.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderView {
    #[serde(flatten)]
    pub folder: Folder,
    /// "owner" | "editor" | "viewer".
    pub my_role: String,
    /// Set when the caller is not the owner.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub owner_username: Option<String>,
}
