use serde::{Deserialize, Serialize};

/// A share granting a user access to a folder (sub-project).
/// role: "viewer" (read) | "editor" (read+write) | "owner".
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Share {
    #[serde(rename = "_id")]
    pub id: String,
    pub folder_id: String,
    pub user_id: String,
    pub username: String,
    pub role: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateShareInput {
    pub username: String,
    pub role: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateShareInput {
    pub role: String,
}
