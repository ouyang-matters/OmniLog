//! Storage abstraction. Two backends implement the same trait:
//!   - `MongoStorage` - MongoDB (the default, configured via MONGODB_URI).
//!   - `JsonStorage`  - embedded file-backed store (no external database),
//!     which powers the desktop client's one-click local server.
//!
//! Handlers depend only on the `Storage` trait, so they are backend-agnostic.

pub mod json;
pub mod mongo;

use async_trait::async_trait;

use crate::error::AppResult;
use crate::models::asset::Asset;
use crate::models::entry::Entry;
use crate::models::folder::Folder;
use crate::models::license::License;
use crate::models::message::Message;
use crate::models::share::Share;
use crate::models::user::{AuthToken, User};
use crate::models::version::Version;

#[async_trait]
pub trait Storage: Send + Sync {
    /// A user's own non-deleted entries in a folder (`None` = root), optional tag.
    async fn list_entries(
        &self,
        user_id: &str,
        folder_id: Option<&str>,
        tag: Option<&str>,
    ) -> AppResult<Vec<Entry>>;

    /// All non-deleted entries in a folder regardless of owner (used for shared
    /// folders once access has been checked).
    async fn list_folder_entries(
        &self,
        folder_id: &str,
        tag: Option<&str>,
    ) -> AppResult<Vec<Entry>>;

    /// A single entry by id (regardless of deleted state); `None` if missing.
    async fn get_entry(&self, id: &str) -> AppResult<Option<Entry>>;

    async fn insert_entry(&self, entry: &Entry) -> AppResult<()>;

    /// Replace an existing entry; returns false if no entry with that id exists.
    async fn replace_entry(&self, entry: &Entry) -> AppResult<bool>;

    /// Case-insensitive search across a user's own entries (title/body/tags).
    async fn search_entries(&self, user_id: &str, q: &str) -> AppResult<Vec<Entry>>;

    /// A user's entries for export (sorted by date desc), or the given ids.
    async fn export_entries(&self, user_id: &str, ids: Option<&[String]>) -> AppResult<Vec<Entry>>;

    async fn insert_asset(&self, asset: &Asset) -> AppResult<()>;
    async fn get_asset(&self, id: &str) -> AppResult<Option<Asset>>;
    /// Delete and return the asset metadata (so the caller can remove the file).
    async fn delete_asset(&self, id: &str) -> AppResult<Option<Asset>>;

    // --- Version history ---
    async fn add_version(&self, version: &Version) -> AppResult<()>;
    /// Snapshots for an entry, newest first.
    async fn list_versions(&self, entry_id: &str) -> AppResult<Vec<Version>>;
    async fn get_version(&self, entry_id: &str, version: i64) -> AppResult<Option<Version>>;

    // --- Key/value settings ---
    async fn get_setting(&self, key: &str) -> AppResult<Option<String>>;
    async fn set_setting(&self, key: &str, value: &str) -> AppResult<()>;

    // --- Folders ---
    async fn create_folder(&self, folder: &Folder) -> AppResult<()>;
    /// A user's own folders.
    async fn list_folders(&self, user_id: &str) -> AppResult<Vec<Folder>>;
    async fn get_folder(&self, id: &str) -> AppResult<Option<Folder>>;
    async fn replace_folder(&self, folder: &Folder) -> AppResult<bool>;
    /// Delete a folder. Returns the number of folders deleted (0 if missing).
    async fn delete_folder(&self, id: &str) -> AppResult<bool>;
    /// Count non-deleted entries directly in a folder (for delete guards).
    async fn count_entries_in_folder(&self, folder_id: &str) -> AppResult<u64>;

    /// Count a user's non-deleted entries across all folders (for plan limits).
    async fn count_entries(&self, user_id: &str) -> AppResult<u64>;

    // --- Users ---
    async fn count_users(&self) -> AppResult<u64>;
    async fn create_user(&self, user: &User) -> AppResult<()>;
    async fn get_user(&self, id: &str) -> AppResult<Option<User>>;
    async fn get_user_by_username(&self, username: &str) -> AppResult<Option<User>>;
    async fn get_user_by_email(&self, email: &str) -> AppResult<Option<User>>;
    async fn list_users(&self) -> AppResult<Vec<User>>;
    /// Replace an existing user. Returns false if no user with that id exists.
    async fn replace_user(&self, user: &User) -> AppResult<bool>;
    /// Delete a user. Returns true if a user was removed.
    async fn delete_user(&self, id: &str) -> AppResult<bool>;

    // --- Auth tokens (email verification / password reset) ---
    async fn insert_auth_token(&self, token: &AuthToken) -> AppResult<()>;
    async fn get_auth_token(&self, token: &str) -> AppResult<Option<AuthToken>>;
    async fn delete_auth_token(&self, token: &str) -> AppResult<()>;
    /// Remove all tokens for a user+kind (e.g. after successful verification).
    async fn delete_auth_tokens_for(&self, user_id: &str, kind: &str) -> AppResult<()>;

    // --- Folder shares ---
    async fn add_share(&self, share: &Share) -> AppResult<()>;
    async fn list_shares_for_user(&self, user_id: &str) -> AppResult<Vec<Share>>;
    async fn list_shares_for_folder(&self, folder_id: &str) -> AppResult<Vec<Share>>;
    async fn get_share(&self, folder_id: &str, user_id: &str) -> AppResult<Option<Share>>;
    async fn remove_share(&self, folder_id: &str, user_id: &str) -> AppResult<bool>;
    /// Update the role on an existing share. Returns the updated share, or
    /// `None` if it didn't exist.
    async fn update_share_role(
        &self,
        folder_id: &str,
        user_id: &str,
        role: &str,
    ) -> AppResult<Option<Share>>;

    // --- Licenses (billing) ---
    /// Upsert a license row, keyed on `License::user_id`.
    async fn upsert_license(&self, license: &License) -> AppResult<()>;
    /// Fetch a user's license, or `None` if they have no row yet.
    async fn get_license(&self, user_id: &str) -> AppResult<Option<License>>;
    /// Find the license row whose `stripe_customer_id` matches — used by
    /// the webhook handler to route a Stripe event back to a user.
    async fn get_license_by_customer(&self, customer_id: &str) -> AppResult<Option<License>>;

    // --- Messages / notifications inbox ---
    async fn insert_message(&self, message: &Message) -> AppResult<()>;
    /// Messages for a user, newest first.
    async fn list_messages(&self, user_id: &str) -> AppResult<Vec<Message>>;
    async fn get_message(&self, id: &str) -> AppResult<Option<Message>>;
    /// Mark one message read. Returns true if a row was changed.
    async fn mark_message_read(&self, user_id: &str, id: &str, at: &str) -> AppResult<bool>;
    /// Mark every unread message for a user as read. Returns count updated.
    async fn mark_all_messages_read(&self, user_id: &str, at: &str) -> AppResult<u64>;
    /// Delete a single message (scoped to recipient). Returns true on success.
    async fn delete_message(&self, user_id: &str, id: &str) -> AppResult<bool>;
}
