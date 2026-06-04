use anyhow::Context;
use async_trait::async_trait;
use futures::TryStreamExt;
use mongodb::bson::doc;
use mongodb::options::IndexOptions;
use mongodb::{Client, Collection, Database, IndexModel};

use crate::config::Config;
use crate::error::AppResult;
use crate::models::asset::Asset;
use crate::models::entry::Entry;
use crate::models::folder::Folder;
use crate::models::license::License;
use crate::models::message::Message;
use crate::models::share::Share;
use crate::models::user::User;
use crate::models::version::Version;

use super::Storage;

/// MongoDB-backed storage (the default backend).
pub struct MongoStorage {
    database: Database,
}

impl MongoStorage {
    pub async fn connect(config: &Config) -> anyhow::Result<Self> {
        let client = Client::with_uri_str(&config.mongodb_uri)
            .await
            .with_context(|| format!("failed to connect to MongoDB at {}", config.mongodb_uri))?;
        client
            .database("admin")
            .run_command(doc! { "ping": 1 })
            .await
            .context("MongoDB ping failed - is the database running and reachable?")?;

        let storage = Self {
            database: client.database(&config.mongodb_db),
        };
        storage.ensure_indexes().await?;
        Ok(storage)
    }

    fn entries(&self) -> Collection<Entry> {
        self.database.collection::<Entry>("entries")
    }

    fn assets(&self) -> Collection<Asset> {
        self.database.collection::<Asset>("assets")
    }

    fn versions(&self) -> Collection<Version> {
        self.database.collection::<Version>("versions")
    }

    fn settings(&self) -> Collection<mongodb::bson::Document> {
        self.database.collection::<mongodb::bson::Document>("settings")
    }

    fn folders(&self) -> Collection<Folder> {
        self.database.collection::<Folder>("folders")
    }

    fn users(&self) -> Collection<User> {
        self.database.collection::<User>("users")
    }

    fn shares(&self) -> Collection<Share> {
        self.database.collection::<Share>("shares")
    }

    fn messages(&self) -> Collection<Message> {
        self.database.collection::<Message>("messages")
    }

    fn licenses(&self) -> Collection<License> {
        self.database.collection::<License>("licenses")
    }

    async fn ensure_indexes(&self) -> anyhow::Result<()> {
        self.entries()
            .create_indexes(vec![
                IndexModel::builder()
                    .keys(doc! { "userId": 1, "updatedAt": -1 })
                    .build(),
                IndexModel::builder().keys(doc! { "tags": 1 }).build(),
            ])
            .await
            .context("failed to create entry indexes")?;
        self.assets()
            .create_index(IndexModel::builder().keys(doc! { "entryId": 1 }).build())
            .await
            .context("failed to create asset indexes")?;
        self.users()
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "username": 1 })
                    .options(IndexOptions::builder().unique(true).build())
                    .build(),
            )
            .await
            .context("failed to create user index")?;
        self.messages()
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "userId": 1, "createdAt": -1 })
                    .build(),
            )
            .await
            .context("failed to create message index")?;
        // `_id` is already user_id (one license per user), but webhook routing
        // needs a lookup by Stripe customer id too.
        self.licenses()
            .create_index(
                IndexModel::builder()
                    .keys(doc! { "stripeCustomerId": 1 })
                    .build(),
            )
            .await
            .context("failed to create license index")?;
        Ok(())
    }
}

fn regex_escape(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for ch in input.chars() {
        if "\\^$.|?*+()[]{}".contains(ch) {
            out.push('\\');
        }
        out.push(ch);
    }
    out
}

#[async_trait]
impl Storage for MongoStorage {
    async fn list_entries(
        &self,
        user_id: &str,
        folder_id: Option<&str>,
        tag: Option<&str>,
    ) -> AppResult<Vec<Entry>> {
        let mut filter = doc! {
            "userId": user_id,
            "deletedAt": null,
            "folderId": match folder_id {
                Some(id) => mongodb::bson::Bson::String(id.to_string()),
                None => mongodb::bson::Bson::Null,
            },
        };
        if let Some(tag) = tag.filter(|t| !t.is_empty()) {
            filter.insert("tags", tag);
        }
        let cursor = self.entries().find(filter).sort(doc! { "updatedAt": -1 }).await?;
        Ok(cursor.try_collect().await?)
    }

    async fn list_folder_entries(
        &self,
        folder_id: &str,
        tag: Option<&str>,
    ) -> AppResult<Vec<Entry>> {
        let mut filter = doc! { "folderId": folder_id, "deletedAt": null };
        if let Some(tag) = tag.filter(|t| !t.is_empty()) {
            filter.insert("tags", tag);
        }
        let cursor = self.entries().find(filter).sort(doc! { "updatedAt": -1 }).await?;
        Ok(cursor.try_collect().await?)
    }

    async fn get_entry(&self, id: &str) -> AppResult<Option<Entry>> {
        Ok(self.entries().find_one(doc! { "_id": id }).await?)
    }

    async fn insert_entry(&self, entry: &Entry) -> AppResult<()> {
        self.entries().insert_one(entry).await?;
        Ok(())
    }

    async fn replace_entry(&self, entry: &Entry) -> AppResult<bool> {
        let res = self
            .entries()
            .replace_one(doc! { "_id": &entry.id }, entry)
            .await?;
        Ok(res.matched_count > 0)
    }

    async fn search_entries(&self, user_id: &str, q: &str) -> AppResult<Vec<Entry>> {
        let needle = doc! { "$regex": regex_escape(q), "$options": "i" };
        let filter = doc! {
            "userId": user_id,
            "deletedAt": null,
            "$or": [
                { "title": needle.clone() },
                { "contentText": needle.clone() },
                { "tags": needle },
            ],
        };
        let cursor = self.entries().find(filter).sort(doc! { "updatedAt": -1 }).await?;
        Ok(cursor.try_collect().await?)
    }

    async fn export_entries(&self, user_id: &str, ids: Option<&[String]>) -> AppResult<Vec<Entry>> {
        let mut filter = doc! { "userId": user_id, "deletedAt": null };
        if let Some(ids) = ids.filter(|v| !v.is_empty()) {
            filter.insert("_id", doc! { "$in": ids.to_vec() });
        }
        let cursor = self.entries().find(filter).sort(doc! { "date": -1 }).await?;
        Ok(cursor.try_collect().await?)
    }

    async fn insert_asset(&self, asset: &Asset) -> AppResult<()> {
        self.assets().insert_one(asset).await?;
        Ok(())
    }

    async fn get_asset(&self, id: &str) -> AppResult<Option<Asset>> {
        Ok(self.assets().find_one(doc! { "_id": id }).await?)
    }

    async fn delete_asset(&self, id: &str) -> AppResult<Option<Asset>> {
        // find_one_and_delete returns the document as it was before deletion.
        Ok(self
            .assets()
            .find_one_and_delete(doc! { "_id": id })
            .await?)
    }

    async fn add_version(&self, version: &Version) -> AppResult<()> {
        self.versions().insert_one(version).await?;
        Ok(())
    }

    async fn list_versions(&self, entry_id: &str) -> AppResult<Vec<Version>> {
        let cursor = self
            .versions()
            .find(doc! { "entryId": entry_id })
            .sort(doc! { "version": -1 })
            .await?;
        Ok(cursor.try_collect().await?)
    }

    async fn get_version(&self, entry_id: &str, version: i64) -> AppResult<Option<Version>> {
        Ok(self
            .versions()
            .find_one(doc! { "entryId": entry_id, "version": version })
            .await?)
    }

    async fn get_setting(&self, key: &str) -> AppResult<Option<String>> {
        let doc = self.settings().find_one(doc! { "_id": key }).await?;
        Ok(doc.and_then(|d| d.get_str("value").ok().map(|s| s.to_string())))
    }

    async fn set_setting(&self, key: &str, value: &str) -> AppResult<()> {
        self.settings()
            .replace_one(
                doc! { "_id": key },
                doc! { "_id": key, "value": value },
            )
            .upsert(true)
            .await?;
        Ok(())
    }

    async fn create_folder(&self, folder: &Folder) -> AppResult<()> {
        self.folders().insert_one(folder).await?;
        Ok(())
    }

    async fn list_folders(&self, user_id: &str) -> AppResult<Vec<Folder>> {
        let cursor = self
            .folders()
            .find(doc! { "userId": user_id })
            .sort(doc! { "name": 1 })
            .await?;
        Ok(cursor.try_collect().await?)
    }

    async fn get_folder(&self, id: &str) -> AppResult<Option<Folder>> {
        Ok(self.folders().find_one(doc! { "_id": id }).await?)
    }

    async fn replace_folder(&self, folder: &Folder) -> AppResult<bool> {
        let res = self
            .folders()
            .replace_one(doc! { "_id": &folder.id }, folder)
            .await?;
        Ok(res.matched_count > 0)
    }

    async fn delete_folder(&self, id: &str) -> AppResult<bool> {
        let res = self.folders().delete_one(doc! { "_id": id }).await?;
        Ok(res.deleted_count > 0)
    }

    async fn count_entries_in_folder(&self, folder_id: &str) -> AppResult<u64> {
        Ok(self
            .entries()
            .count_documents(doc! { "folderId": folder_id, "deletedAt": null })
            .await?)
    }

    async fn count_users(&self) -> AppResult<u64> {
        Ok(self.users().count_documents(doc! {}).await?)
    }

    async fn create_user(&self, user: &User) -> AppResult<()> {
        self.users().insert_one(user).await?;
        Ok(())
    }

    async fn get_user(&self, id: &str) -> AppResult<Option<User>> {
        Ok(self.users().find_one(doc! { "_id": id }).await?)
    }

    async fn get_user_by_username(&self, username: &str) -> AppResult<Option<User>> {
        Ok(self.users().find_one(doc! { "username": username }).await?)
    }

    async fn list_users(&self) -> AppResult<Vec<User>> {
        let cursor = self.users().find(doc! {}).sort(doc! { "username": 1 }).await?;
        Ok(cursor.try_collect().await?)
    }

    async fn replace_user(&self, user: &User) -> AppResult<bool> {
        let res = self
            .users()
            .replace_one(doc! { "_id": &user.id }, user)
            .await?;
        Ok(res.matched_count > 0)
    }

    async fn delete_user(&self, id: &str) -> AppResult<bool> {
        let res = self.users().delete_one(doc! { "_id": id }).await?;
        Ok(res.deleted_count > 0)
    }

    async fn add_share(&self, share: &Share) -> AppResult<()> {
        self.shares().insert_one(share).await?;
        Ok(())
    }

    async fn list_shares_for_user(&self, user_id: &str) -> AppResult<Vec<Share>> {
        let cursor = self.shares().find(doc! { "userId": user_id }).await?;
        Ok(cursor.try_collect().await?)
    }

    async fn list_shares_for_folder(&self, folder_id: &str) -> AppResult<Vec<Share>> {
        let cursor = self.shares().find(doc! { "folderId": folder_id }).await?;
        Ok(cursor.try_collect().await?)
    }

    async fn get_share(&self, folder_id: &str, user_id: &str) -> AppResult<Option<Share>> {
        Ok(self
            .shares()
            .find_one(doc! { "folderId": folder_id, "userId": user_id })
            .await?)
    }

    async fn remove_share(&self, folder_id: &str, user_id: &str) -> AppResult<bool> {
        let res = self
            .shares()
            .delete_one(doc! { "folderId": folder_id, "userId": user_id })
            .await?;
        Ok(res.deleted_count > 0)
    }

    async fn update_share_role(
        &self,
        folder_id: &str,
        user_id: &str,
        role: &str,
    ) -> AppResult<Option<Share>> {
        // Run update then fetch — `find_one_and_update` would be one round trip
        // but requires more options; the share collection is tiny so this is fine.
        let res = self
            .shares()
            .update_one(
                doc! { "folderId": folder_id, "userId": user_id },
                doc! { "$set": { "role": role } },
            )
            .await?;
        if res.matched_count == 0 {
            return Ok(None);
        }
        Ok(self
            .shares()
            .find_one(doc! { "folderId": folder_id, "userId": user_id })
            .await?)
    }

    async fn insert_message(&self, message: &Message) -> AppResult<()> {
        self.messages().insert_one(message).await?;
        Ok(())
    }

    async fn list_messages(&self, user_id: &str) -> AppResult<Vec<Message>> {
        let cursor = self
            .messages()
            .find(doc! { "userId": user_id })
            .sort(doc! { "createdAt": -1 })
            .await?;
        Ok(cursor.try_collect().await?)
    }

    async fn get_message(&self, id: &str) -> AppResult<Option<Message>> {
        Ok(self.messages().find_one(doc! { "_id": id }).await?)
    }

    async fn mark_message_read(&self, user_id: &str, id: &str, at: &str) -> AppResult<bool> {
        let res = self
            .messages()
            .update_one(
                doc! { "_id": id, "userId": user_id, "readAt": null },
                doc! { "$set": { "readAt": at } },
            )
            .await?;
        Ok(res.modified_count > 0)
    }

    async fn mark_all_messages_read(&self, user_id: &str, at: &str) -> AppResult<u64> {
        let res = self
            .messages()
            .update_many(
                doc! { "userId": user_id, "readAt": null },
                doc! { "$set": { "readAt": at } },
            )
            .await?;
        Ok(res.modified_count)
    }

    async fn delete_message(&self, user_id: &str, id: &str) -> AppResult<bool> {
        let res = self
            .messages()
            .delete_one(doc! { "_id": id, "userId": user_id })
            .await?;
        Ok(res.deleted_count > 0)
    }

    async fn upsert_license(&self, license: &License) -> AppResult<()> {
        // Mongo's `_id` is immutable; `License::user_id` doubles as `_id`
        // so the upsert key never changes for a given user.
        self.licenses()
            .replace_one(doc! { "_id": &license.user_id }, license)
            .upsert(true)
            .await?;
        Ok(())
    }

    async fn get_license(&self, user_id: &str) -> AppResult<Option<License>> {
        Ok(self.licenses().find_one(doc! { "_id": user_id }).await?)
    }

    async fn get_license_by_customer(&self, customer_id: &str) -> AppResult<Option<License>> {
        Ok(self
            .licenses()
            .find_one(doc! { "stripeCustomerId": customer_id })
            .await?)
    }
}
