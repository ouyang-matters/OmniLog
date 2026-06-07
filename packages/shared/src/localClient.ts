/**
 * A fully local, no-network implementation of the {@link ApiClient} surface.
 *
 * Offline mode swaps the live `ApiClient` for one of these. Because it extends
 * `ApiClient` it is a drop-in: the apps keep calling `client.listEntries()`,
 * `client.createEntry()`, `client.uploadImage()`, etc. unchanged — the data
 * just lives on the device instead of a server.
 *
 * Data is purely local and never synced anywhere. Images are stored inline as
 * data URLs. Version history is not kept (offline has no version restore).
 */
import { ApiClient } from "./api.js";
import type {
  Asset,
  EntryVersion,
  Folder,
  HealthResponse,
  License,
  Message,
  PublicUser,
  ServerSettings,
  WorklogEntry,
} from "./types.js";
import type { CreateEntryInput, UpdateEntryInput } from "./schemas.js";

/** Minimal key/value persistence the host app provides (e.g. a Tauri store). */
export interface KeyValueStore {
  get<T>(key: string): Promise<T | null | undefined>;
  set(key: string, value: unknown): Promise<void>;
}

const ENTRIES_KEY = "local.entries";
const FOLDERS_KEY = "local.folders";
const ASSETS_KEY = "local.assets";
const PROFILE_KEY = "local.profile";

const LOCAL_USER_ID = "local-user";

interface StoredAsset {
  asset: Asset;
  /** `data:<mime>;base64,...` */
  dataUrl: string;
}

function uuid(): string {
  return crypto.randomUUID();
}

function nowIso(): string {
  return new Date().toISOString();
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(",", 2);
  const mimeMatch = /data:([^;]+)/.exec(head);
  const mime = mimeMatch ? mimeMatch[1] : "application/octet-stream";
  const isBase64 = /;base64/i.test(head);
  if (!isBase64) {
    return new Blob([decodeURIComponent(body)], { type: mime });
  }
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/**
 * The id used to mark a `ServerConnection` as the on-device local store.
 * Such a connection has empty `serverUrl`/`apiToken`.
 */
export const OFFLINE_KIND = "offline" as const;

export class LocalApiClient extends ApiClient {
  private store: KeyValueStore;
  private deviceId: string;

  constructor(store: KeyValueStore, deviceId: string) {
    // Base class needs *something*; a rejecting fetch guarantees any
    // un-overridden method fails loudly rather than hitting the network.
    super({
      baseUrl: "local://offline",
      token: "local",
      fetch: () => Promise.reject(new Error("offline: no network")),
    });
    this.store = store;
    this.deviceId = deviceId;
  }

  private async entries(): Promise<Record<string, WorklogEntry>> {
    return (await this.store.get<Record<string, WorklogEntry>>(ENTRIES_KEY)) ?? {};
  }
  private async writeEntries(v: Record<string, WorklogEntry>): Promise<void> {
    await this.store.set(ENTRIES_KEY, v);
  }
  private async folderMap(): Promise<Record<string, Folder>> {
    return (await this.store.get<Record<string, Folder>>(FOLDERS_KEY)) ?? {};
  }
  private async writeFolders(v: Record<string, Folder>): Promise<void> {
    await this.store.set(FOLDERS_KEY, v);
  }
  private async assetMap(): Promise<Record<string, StoredAsset>> {
    return (await this.store.get<Record<string, StoredAsset>>(ASSETS_KEY)) ?? {};
  }
  private async writeAssets(v: Record<string, StoredAsset>): Promise<void> {
    await this.store.set(ASSETS_KEY, v);
  }

  // --- Health / identity ---
  override health(): Promise<HealthResponse> {
    return Promise.resolve({ ok: true, name: "OmniLog (Local)", version: "local" });
  }

  override async me(): Promise<PublicUser> {
    const saved = await this.store.get<PublicUser>(PROFILE_KEY);
    return (
      saved ?? {
        id: LOCAL_USER_ID,
        username: "local",
        role: "owner",
        createdAt: nowIso(),
        displayName: "Local",
      }
    );
  }

  override async updateMe(input: { displayName?: string; avatarDataUrl?: string }): Promise<PublicUser> {
    const cur = await this.me();
    const next: PublicUser = { ...cur, ...input };
    await this.store.set(PROFILE_KEY, next);
    return next;
  }

  override getSettings(): Promise<ServerSettings> {
    return Promise.resolve({ versioningEnabled: false });
  }
  override updateSettings(): Promise<ServerSettings> {
    return Promise.resolve({ versioningEnabled: false });
  }

  override async getLicense(): Promise<License> {
    // Offline has no plan/billing. Surfacing "free" with no expiry keeps any
    // license-aware UI from crashing; billing UI is hidden for offline anyway.
    return { plan: "free" };
  }

  override listMessages(): Promise<Message[]> {
    return Promise.resolve([]);
  }
  override listUsers(): Promise<PublicUser[]> {
    return this.me().then((u) => [u]);
  }

  // --- Folders ---
  override async listFolders(): Promise<Folder[]> {
    const map = await this.folderMap();
    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
  }

  override async createFolder(input: { name: string; parentId?: string | null }): Promise<Folder> {
    const map = await this.folderMap();
    const folder: Folder = {
      _id: uuid(),
      userId: LOCAL_USER_ID,
      parentId: input.parentId ?? null,
      name: input.name,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      myRole: "owner",
    };
    map[folder._id] = folder;
    await this.writeFolders(map);
    return folder;
  }

  override async updateFolder(id: string, input: { name?: string; parentId?: string | null }): Promise<Folder> {
    const map = await this.folderMap();
    const cur = map[id];
    if (!cur) throw new Error("folder not found");
    const next: Folder = {
      ...cur,
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
      updatedAt: nowIso(),
    };
    map[id] = next;
    await this.writeFolders(map);
    return next;
  }

  override async deleteFolder(id: string): Promise<{ ok: true }> {
    const map = await this.folderMap();
    delete map[id];
    // Reparent child folders to root.
    for (const f of Object.values(map)) {
      if (f.parentId === id) f.parentId = null;
    }
    await this.writeFolders(map);
    // Move entries from the deleted folder to root.
    const ents = await this.entries();
    for (const e of Object.values(ents)) {
      if (e.folderId === id) e.folderId = null;
    }
    await this.writeEntries(ents);
    return { ok: true };
  }

  // --- Entries ---
  private sortEntries(list: WorklogEntry[]): WorklogEntry[] {
    return list.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return a.updatedAt < b.updatedAt ? 1 : -1;
    });
  }

  override async listEntries(params?: { tag?: string; folderId?: string | null }): Promise<WorklogEntry[]> {
    const map = await this.entries();
    let list = Object.values(map).filter((e) => !e.deletedAt);
    if (params?.folderId) {
      list = list.filter((e) => e.folderId === params.folderId);
    } else {
      list = list.filter((e) => !e.folderId);
    }
    if (params?.tag) list = list.filter((e) => e.tags.includes(params.tag!));
    return this.sortEntries(list);
  }

  override async getEntry(id: string): Promise<WorklogEntry> {
    const map = await this.entries();
    const e = map[id];
    if (!e) throw new Error("entry not found");
    return e;
  }

  override async createEntry(input: CreateEntryInput): Promise<WorklogEntry> {
    const map = await this.entries();
    const entry: WorklogEntry = {
      _id: uuid(),
      userId: LOCAL_USER_ID,
      folderId: input.folderId ?? null,
      title: input.title ?? "",
      date: input.date,
      contentJson: input.contentJson,
      contentText: input.contentText ?? "",
      contentHtml: input.contentHtml,
      tags: input.tags ?? [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
      version: 1,
      syncStatus: "local",
      deviceId: input.deviceId || this.deviceId,
      mode: input.mode,
    };
    map[entry._id] = entry;
    await this.writeEntries(map);
    return entry;
  }

  override async updateEntry(id: string, input: UpdateEntryInput): Promise<WorklogEntry> {
    const map = await this.entries();
    const cur = map[id];
    if (!cur) throw new Error("entry not found");
    const next: WorklogEntry = {
      ...cur,
      ...(input.folderId !== undefined ? { folderId: input.folderId } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.date !== undefined ? { date: input.date } : {}),
      ...(input.contentJson !== undefined ? { contentJson: input.contentJson } : {}),
      ...(input.contentText !== undefined ? { contentText: input.contentText } : {}),
      ...(input.contentHtml !== undefined ? { contentHtml: input.contentHtml } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
      ...(input.mode !== undefined ? { mode: input.mode } : {}),
      updatedAt: nowIso(),
      version: cur.version + 1,
      syncStatus: "local",
    };
    map[id] = next;
    await this.writeEntries(map);
    return next;
  }

  override async deleteEntry(id: string): Promise<{ ok: true }> {
    const map = await this.entries();
    delete map[id];
    await this.writeEntries(map);
    // Drop any assets attached to this entry.
    const assets = await this.assetMap();
    let changed = false;
    for (const [aid, sa] of Object.entries(assets)) {
      if (sa.asset.entryId === id) {
        delete assets[aid];
        changed = true;
      }
    }
    if (changed) await this.writeAssets(assets);
    return { ok: true };
  }

  override async search(q: string): Promise<WorklogEntry[]> {
    const needle = q.trim().toLowerCase();
    const map = await this.entries();
    const list = Object.values(map).filter(
      (e) =>
        !e.deletedAt &&
        (e.title.toLowerCase().includes(needle) ||
          e.contentText.toLowerCase().includes(needle) ||
          e.tags.some((t) => t.toLowerCase().includes(needle))),
    );
    return this.sortEntries(list);
  }

  // --- Versions (not kept offline) ---
  override listVersions(): Promise<EntryVersion[]> {
    return Promise.resolve([]);
  }
  override restoreVersion(): Promise<WorklogEntry> {
    return Promise.reject(new Error("Version history is not available in offline mode."));
  }

  // --- Images (stored inline as data URLs) ---
  override async uploadImage(args: {
    entryId: string;
    file: Blob;
    fileName: string;
    caption?: string;
  }): Promise<Asset> {
    const dataUrl = await blobToDataUrl(args.file);
    const id = uuid();
    const asset: Asset = {
      _id: id,
      userId: LOCAL_USER_ID,
      entryId: args.entryId,
      type: "image",
      fileName: args.fileName,
      originalName: args.fileName,
      mimeType: args.file.type || "image/png",
      size: args.file.size,
      storagePath: `local:${id}`,
      publicUrl: `/api/assets/${id}`,
      caption: args.caption,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    const assets = await this.assetMap();
    assets[id] = { asset, dataUrl };
    await this.writeAssets(assets);
    return asset;
  }

  override async getAssetBlob(id: string): Promise<Blob> {
    const assets = await this.assetMap();
    const sa = assets[id];
    if (!sa) throw new Error("asset not found");
    return dataUrlToBlob(sa.dataUrl);
  }

  override async deleteAsset(id: string): Promise<{ ok: true }> {
    const assets = await this.assetMap();
    delete assets[id];
    await this.writeAssets(assets);
    return { ok: true };
  }
}
