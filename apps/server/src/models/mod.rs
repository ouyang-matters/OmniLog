pub mod asset;
pub mod entry;
pub mod folder;
pub mod license;
pub mod message;
pub mod share;
pub mod user;
pub mod version;

/// MVP single-user id. Token auth identifies "the owner of this server", so all
/// documents are filed under one user. Multi-user JWT can replace this later
/// without changing the document shape.
pub const DEFAULT_USER_ID: &str = "local-user";

pub fn now_rfc3339() -> String {
    chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}

pub fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}
