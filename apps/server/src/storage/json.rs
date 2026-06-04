use std::collections::HashMap;
use std::path::{Path, PathBuf};

use anyhow::Context;
use async_trait::async_trait;
use tokio::sync::RwLock;

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

/// Embedded, file-backed storage - no external database required. Documents are
/// held in memory and written through to JSON files under DATA_DIR on every
/// mutation. This powers the desktop client's one-click local server.
///
/// It targets a single local user with modest data volumes (a personal work
/// journal), where simplicity and zero dependencies matter more than the
/// throughput of a full database.
pub struct JsonStorage {
    entries: RwLock<HashMap<String, Entry>>,
    assets: RwLock<HashMap<String, Asset>>,
    versions: RwLock<Vec<Version>>,
    settings: RwLock<HashMap<String, String>>,
    folders: RwLock<HashMap<String, Folder>>,
    users: RwLock<HashMap<String, User>>,
    shares: RwLock<Vec<Share>>,
    messages: RwLock<Vec<Message>>,
    licenses: RwLock<HashMap<String, License>>,
    entries_path: PathBuf,
    assets_path: PathBuf,
    versions_path: PathBuf,
    settings_path: PathBuf,
    folders_path: PathBuf,
    users_path: PathBuf,
    shares_path: PathBuf,
    messages_path: PathBuf,
    licenses_path: PathBuf,
}

impl JsonStorage {
    pub async fn load(data_dir: &Path) -> anyhow::Result<Self> {
        let db_dir = data_dir.join("db");
        std::fs::create_dir_all(&db_dir)
            .with_context(|| format!("failed to create {}", db_dir.display()))?;
        let entries_path = db_dir.join("entries.json");
        let assets_path = db_dir.join("assets.json");
        let versions_path = db_dir.join("versions.json");
        let settings_path = db_dir.join("settings.json");
        let folders_path = db_dir.join("folders.json");
        let users_path = db_dir.join("users.json");
        let shares_path = db_dir.join("shares.json");
        let messages_path = db_dir.join("messages.json");
        let licenses_path = db_dir.join("licenses.json");

        let entries = read_map(&entries_path).await?;
        let assets = read_map(&assets_path).await?;
        let versions = read_vec(&versions_path).await?;
        let settings = read_json(&settings_path).await?.unwrap_or_default();
        let folders = read_map(&folders_path).await?;
        let users = read_map(&users_path).await?;
        let shares = read_vec(&shares_path).await?;
        let messages = read_vec(&messages_path).await?;
        let licenses = read_map(&licenses_path).await?;

        Ok(Self {
            entries: RwLock::new(entries),
            assets: RwLock::new(assets),
            versions: RwLock::new(versions),
            settings: RwLock::new(settings),
            folders: RwLock::new(folders),
            users: RwLock::new(users),
            shares: RwLock::new(shares),
            messages: RwLock::new(messages),
            licenses: RwLock::new(licenses),
            entries_path,
            assets_path,
            versions_path,
            settings_path,
            folders_path,
            users_path,
            shares_path,
            messages_path,
            licenses_path,
        })
    }

    async fn flush_licenses(&self, map: &HashMap<String, License>) -> AppResult<()> {
        let json = serde_json::to_vec_pretty(&map.values().collect::<Vec<_>>())?;
        tokio::fs::write(&self.licenses_path, json).await?;
        Ok(())
    }

    async fn flush_folders(&self, map: &HashMap<String, Folder>) -> AppResult<()> {
        let json = serde_json::to_vec_pretty(&map.values().collect::<Vec<_>>())?;
        tokio::fs::write(&self.folders_path, json).await?;
        Ok(())
    }

    async fn flush_users(&self, map: &HashMap<String, User>) -> AppResult<()> {
        let json = serde_json::to_vec_pretty(&map.values().collect::<Vec<_>>())?;
        tokio::fs::write(&self.users_path, json).await?;
        Ok(())
    }

    async fn flush_shares(&self, shares: &[Share]) -> AppResult<()> {
        tokio::fs::write(&self.shares_path, serde_json::to_vec_pretty(shares)?).await?;
        Ok(())
    }

    async fn flush_messages(&self, messages: &[Message]) -> AppResult<()> {
        tokio::fs::write(&self.messages_path, serde_json::to_vec_pretty(messages)?).await?;
        Ok(())
    }

    async fn flush_versions(&self, versions: &[Version]) -> AppResult<()> {
        tokio::fs::write(&self.versions_path, serde_json::to_vec_pretty(versions)?).await?;
        Ok(())
    }

    async fn flush_settings(&self, settings: &HashMap<String, String>) -> AppResult<()> {
        tokio::fs::write(&self.settings_path, serde_json::to_vec_pretty(settings)?).await?;
        Ok(())
    }

    async fn flush_entries(&self, map: &HashMap<String, Entry>) -> AppResult<()> {
        let json = serde_json::to_vec_pretty(&map.values().collect::<Vec<_>>())?;
        tokio::fs::write(&self.entries_path, json).await?;
        Ok(())
    }

    async fn flush_assets(&self, map: &HashMap<String, Asset>) -> AppResult<()> {
        let json = serde_json::to_vec_pretty(&map.values().collect::<Vec<_>>())?;
        tokio::fs::write(&self.assets_path, json).await?;
        Ok(())
    }
}

async fn read_map<T>(path: &Path) -> anyhow::Result<HashMap<String, T>>
where
    T: serde::de::DeserializeOwned + HasId,
{
    if !path.exists() {
        return Ok(HashMap::new());
    }
    let bytes = tokio::fs::read(path)
        .await
        .with_context(|| format!("failed to read {}", path.display()))?;
    if bytes.is_empty() {
        return Ok(HashMap::new());
    }
    let items: Vec<T> = serde_json::from_slice(&bytes)
        .with_context(|| format!("failed to parse {}", path.display()))?;
    Ok(items.into_iter().map(|i| (i.id().to_string(), i)).collect())
}

async fn read_vec<T: serde::de::DeserializeOwned>(path: &Path) -> anyhow::Result<Vec<T>> {
    if !path.exists() {
        return Ok(Vec::new());
    }
    let bytes = tokio::fs::read(path).await?;
    if bytes.is_empty() {
        return Ok(Vec::new());
    }
    Ok(serde_json::from_slice(&bytes)
        .with_context(|| format!("failed to parse {}", path.display()))?)
}

async fn read_json<T: serde::de::DeserializeOwned>(path: &Path) -> anyhow::Result<Option<T>> {
    if !path.exists() {
        return Ok(None);
    }
    let bytes = tokio::fs::read(path).await?;
    if bytes.is_empty() {
        return Ok(None);
    }
    Ok(Some(serde_json::from_slice(&bytes)
        .with_context(|| format!("failed to parse {}", path.display()))?))
}

/// Lets `read_map` re-key a loaded vector by its document id.
trait HasId {
    fn id(&self) -> &str;
}
impl HasId for Entry {
    fn id(&self) -> &str {
        &self.id
    }
}
impl HasId for Asset {
    fn id(&self) -> &str {
        &self.id
    }
}
impl HasId for Folder {
    fn id(&self) -> &str {
        &self.id
    }
}
impl HasId for User {
    fn id(&self) -> &str {
        &self.id
    }
}
impl HasId for License {
    fn id(&self) -> &str {
        &self.user_id
    }
}

fn sort_by_updated_desc(mut v: Vec<Entry>) -> Vec<Entry> {
    v.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    v
}

#[async_trait]
impl Storage for JsonStorage {
    async fn list_entries(
        &self,
        user_id: &str,
        folder_id: Option<&str>,
        tag: Option<&str>,
    ) -> AppResult<Vec<Entry>> {
        let map = self.entries.read().await;
        let items = map
            .values()
            .filter(|e| e.deleted_at.is_none())
            .filter(|e| e.user_id == user_id)
            .filter(|e| e.folder_id.as_deref() == folder_id)
            .filter(|e| match tag {
                Some(t) if !t.is_empty() => e.tags.iter().any(|x| x == t),
                _ => true,
            })
            .cloned()
            .collect();
        Ok(sort_by_updated_desc(items))
    }

    async fn list_folder_entries(
        &self,
        folder_id: &str,
        tag: Option<&str>,
    ) -> AppResult<Vec<Entry>> {
        let map = self.entries.read().await;
        let items = map
            .values()
            .filter(|e| e.deleted_at.is_none())
            .filter(|e| e.folder_id.as_deref() == Some(folder_id))
            .filter(|e| match tag {
                Some(t) if !t.is_empty() => e.tags.iter().any(|x| x == t),
                _ => true,
            })
            .cloned()
            .collect();
        Ok(sort_by_updated_desc(items))
    }

    async fn get_entry(&self, id: &str) -> AppResult<Option<Entry>> {
        Ok(self.entries.read().await.get(id).cloned())
    }

    async fn insert_entry(&self, entry: &Entry) -> AppResult<()> {
        let mut map = self.entries.write().await;
        map.insert(entry.id.clone(), entry.clone());
        self.flush_entries(&map).await
    }

    async fn replace_entry(&self, entry: &Entry) -> AppResult<bool> {
        let mut map = self.entries.write().await;
        if !map.contains_key(&entry.id) {
            return Ok(false);
        }
        map.insert(entry.id.clone(), entry.clone());
        self.flush_entries(&map).await?;
        Ok(true)
    }

    async fn search_entries(&self, user_id: &str, q: &str) -> AppResult<Vec<Entry>> {
        let needle = q.to_lowercase();
        let map = self.entries.read().await;
        let items = map
            .values()
            .filter(|e| e.deleted_at.is_none())
            .filter(|e| e.user_id == user_id)
            .filter(|e| {
                e.title.to_lowercase().contains(&needle)
                    || e.content_text.to_lowercase().contains(&needle)
                    || e.tags.iter().any(|t| t.to_lowercase().contains(&needle))
            })
            .cloned()
            .collect();
        Ok(sort_by_updated_desc(items))
    }

    async fn export_entries(&self, user_id: &str, ids: Option<&[String]>) -> AppResult<Vec<Entry>> {
        let map = self.entries.read().await;
        let mut items: Vec<Entry> = map
            .values()
            .filter(|e| e.deleted_at.is_none())
            .filter(|e| e.user_id == user_id)
            .filter(|e| match ids {
                Some(ids) if !ids.is_empty() => ids.contains(&e.id),
                _ => true,
            })
            .cloned()
            .collect();
        items.sort_by(|a, b| b.date.cmp(&a.date));
        Ok(items)
    }

    async fn insert_asset(&self, asset: &Asset) -> AppResult<()> {
        let mut map = self.assets.write().await;
        map.insert(asset.id.clone(), asset.clone());
        self.flush_assets(&map).await
    }

    async fn get_asset(&self, id: &str) -> AppResult<Option<Asset>> {
        Ok(self.assets.read().await.get(id).cloned())
    }

    async fn delete_asset(&self, id: &str) -> AppResult<Option<Asset>> {
        let mut map = self.assets.write().await;
        let removed = map.remove(id);
        if removed.is_some() {
            self.flush_assets(&map).await?;
        }
        Ok(removed)
    }

    async fn add_version(&self, version: &Version) -> AppResult<()> {
        let mut v = self.versions.write().await;
        v.push(version.clone());
        self.flush_versions(&v).await
    }

    async fn list_versions(&self, entry_id: &str) -> AppResult<Vec<Version>> {
        let v = self.versions.read().await;
        let mut items: Vec<Version> =
            v.iter().filter(|x| x.entry_id == entry_id).cloned().collect();
        items.sort_by(|a, b| b.version.cmp(&a.version));
        Ok(items)
    }

    async fn get_version(&self, entry_id: &str, version: i64) -> AppResult<Option<Version>> {
        let v = self.versions.read().await;
        Ok(v.iter()
            .find(|x| x.entry_id == entry_id && x.version == version)
            .cloned())
    }

    async fn get_setting(&self, key: &str) -> AppResult<Option<String>> {
        Ok(self.settings.read().await.get(key).cloned())
    }

    async fn set_setting(&self, key: &str, value: &str) -> AppResult<()> {
        let mut s = self.settings.write().await;
        s.insert(key.to_string(), value.to_string());
        self.flush_settings(&s).await
    }

    async fn create_folder(&self, folder: &Folder) -> AppResult<()> {
        let mut map = self.folders.write().await;
        map.insert(folder.id.clone(), folder.clone());
        self.flush_folders(&map).await
    }

    async fn list_folders(&self, user_id: &str) -> AppResult<Vec<Folder>> {
        let map = self.folders.read().await;
        let mut items: Vec<Folder> =
            map.values().filter(|f| f.user_id == user_id).cloned().collect();
        items.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(items)
    }

    async fn get_folder(&self, id: &str) -> AppResult<Option<Folder>> {
        Ok(self.folders.read().await.get(id).cloned())
    }

    async fn replace_folder(&self, folder: &Folder) -> AppResult<bool> {
        let mut map = self.folders.write().await;
        if !map.contains_key(&folder.id) {
            return Ok(false);
        }
        map.insert(folder.id.clone(), folder.clone());
        self.flush_folders(&map).await?;
        Ok(true)
    }

    async fn delete_folder(&self, id: &str) -> AppResult<bool> {
        let mut map = self.folders.write().await;
        let removed = map.remove(id).is_some();
        if removed {
            self.flush_folders(&map).await?;
        }
        Ok(removed)
    }

    async fn count_entries_in_folder(&self, folder_id: &str) -> AppResult<u64> {
        let map = self.entries.read().await;
        Ok(map
            .values()
            .filter(|e| e.deleted_at.is_none() && e.folder_id.as_deref() == Some(folder_id))
            .count() as u64)
    }

    async fn count_users(&self) -> AppResult<u64> {
        Ok(self.users.read().await.len() as u64)
    }

    async fn create_user(&self, user: &User) -> AppResult<()> {
        let mut map = self.users.write().await;
        map.insert(user.id.clone(), user.clone());
        self.flush_users(&map).await
    }

    async fn get_user(&self, id: &str) -> AppResult<Option<User>> {
        Ok(self.users.read().await.get(id).cloned())
    }

    async fn get_user_by_username(&self, username: &str) -> AppResult<Option<User>> {
        Ok(self
            .users
            .read()
            .await
            .values()
            .find(|u| u.username == username)
            .cloned())
    }

    async fn list_users(&self) -> AppResult<Vec<User>> {
        let mut items: Vec<User> = self.users.read().await.values().cloned().collect();
        items.sort_by(|a, b| a.username.cmp(&b.username));
        Ok(items)
    }

    async fn replace_user(&self, user: &User) -> AppResult<bool> {
        let mut map = self.users.write().await;
        if !map.contains_key(&user.id) {
            return Ok(false);
        }
        map.insert(user.id.clone(), user.clone());
        self.flush_users(&map).await?;
        Ok(true)
    }

    async fn delete_user(&self, id: &str) -> AppResult<bool> {
        let mut map = self.users.write().await;
        let removed = map.remove(id).is_some();
        if removed {
            self.flush_users(&map).await?;
        }
        Ok(removed)
    }

    async fn add_share(&self, share: &Share) -> AppResult<()> {
        let mut shares = self.shares.write().await;
        // Replace an existing share for the same folder+user.
        shares.retain(|s| !(s.folder_id == share.folder_id && s.user_id == share.user_id));
        shares.push(share.clone());
        self.flush_shares(&shares).await
    }

    async fn list_shares_for_user(&self, user_id: &str) -> AppResult<Vec<Share>> {
        Ok(self
            .shares
            .read()
            .await
            .iter()
            .filter(|s| s.user_id == user_id)
            .cloned()
            .collect())
    }

    async fn list_shares_for_folder(&self, folder_id: &str) -> AppResult<Vec<Share>> {
        Ok(self
            .shares
            .read()
            .await
            .iter()
            .filter(|s| s.folder_id == folder_id)
            .cloned()
            .collect())
    }

    async fn get_share(&self, folder_id: &str, user_id: &str) -> AppResult<Option<Share>> {
        Ok(self
            .shares
            .read()
            .await
            .iter()
            .find(|s| s.folder_id == folder_id && s.user_id == user_id)
            .cloned())
    }

    async fn remove_share(&self, folder_id: &str, user_id: &str) -> AppResult<bool> {
        let mut shares = self.shares.write().await;
        let before = shares.len();
        shares.retain(|s| !(s.folder_id == folder_id && s.user_id == user_id));
        let removed = shares.len() != before;
        if removed {
            self.flush_shares(&shares).await?;
        }
        Ok(removed)
    }

    async fn update_share_role(
        &self,
        folder_id: &str,
        user_id: &str,
        role: &str,
    ) -> AppResult<Option<Share>> {
        let mut shares = self.shares.write().await;
        let mut updated: Option<Share> = None;
        for s in shares.iter_mut() {
            if s.folder_id == folder_id && s.user_id == user_id {
                s.role = role.to_string();
                updated = Some(s.clone());
                break;
            }
        }
        if updated.is_some() {
            self.flush_shares(&shares).await?;
        }
        Ok(updated)
    }

    async fn insert_message(&self, message: &Message) -> AppResult<()> {
        let mut v = self.messages.write().await;
        v.push(message.clone());
        self.flush_messages(&v).await
    }

    async fn list_messages(&self, user_id: &str) -> AppResult<Vec<Message>> {
        let v = self.messages.read().await;
        let mut items: Vec<Message> =
            v.iter().filter(|m| m.user_id == user_id).cloned().collect();
        items.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        Ok(items)
    }

    async fn get_message(&self, id: &str) -> AppResult<Option<Message>> {
        Ok(self.messages.read().await.iter().find(|m| m.id == id).cloned())
    }

    async fn mark_message_read(&self, user_id: &str, id: &str, at: &str) -> AppResult<bool> {
        let mut v = self.messages.write().await;
        let mut changed = false;
        for m in v.iter_mut() {
            if m.id == id && m.user_id == user_id && m.read_at.is_none() {
                m.read_at = Some(at.to_string());
                changed = true;
                break;
            }
        }
        if changed {
            self.flush_messages(&v).await?;
        }
        Ok(changed)
    }

    async fn mark_all_messages_read(&self, user_id: &str, at: &str) -> AppResult<u64> {
        let mut v = self.messages.write().await;
        let mut count: u64 = 0;
        for m in v.iter_mut() {
            if m.user_id == user_id && m.read_at.is_none() {
                m.read_at = Some(at.to_string());
                count += 1;
            }
        }
        if count > 0 {
            self.flush_messages(&v).await?;
        }
        Ok(count)
    }

    async fn delete_message(&self, user_id: &str, id: &str) -> AppResult<bool> {
        let mut v = self.messages.write().await;
        let before = v.len();
        v.retain(|m| !(m.id == id && m.user_id == user_id));
        let removed = v.len() != before;
        if removed {
            self.flush_messages(&v).await?;
        }
        Ok(removed)
    }

    async fn upsert_license(&self, license: &License) -> AppResult<()> {
        let mut map = self.licenses.write().await;
        map.insert(license.user_id.clone(), license.clone());
        self.flush_licenses(&map).await
    }

    async fn get_license(&self, user_id: &str) -> AppResult<Option<License>> {
        Ok(self.licenses.read().await.get(user_id).cloned())
    }

    async fn get_license_by_customer(&self, customer_id: &str) -> AppResult<Option<License>> {
        Ok(self
            .licenses
            .read()
            .await
            .values()
            .find(|l| l.stripe_customer_id.as_deref() == Some(customer_id))
            .cloned())
    }
}
