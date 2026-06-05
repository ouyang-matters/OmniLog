/**
 * Draft management — shared between desktop and mobile.
 *
 * The `Draft` type and pure operations live here. Platform-specific persistence
 * (Tauri Store on desktop, AsyncStorage/SQLite on mobile) implements the
 * `DraftStore` interface and calls these helpers.
 */
import type { EntryMode, WorklogEntry } from "./types.js";

/**
 * A locally-held draft. Used both as an offline cache of server entries and as
 * the safety net when the server is unreachable: edits are written here first,
 * then flushed to the server when it comes back.
 */
export interface Draft {
  /** Server id once synced; a local `local:<uuid>` id before first sync. */
  id: string;
  /** Folder this entry lives in (null = root). */
  folderId: string | null;
  title: string;
  date: string;
  contentJson: unknown;
  contentText: string;
  contentHtml?: string;
  tags: string[];
  updatedAt: string;
  /** True when local edits have not yet been persisted to the server. */
  dirty: boolean;
  /** Server version this draft was last based on (for conflict detection). */
  baseVersion?: number;
  /** Editor mode. Drafts without this field are treated as "rich". */
  mode?: EntryMode;
}

/** Platform-agnostic persistence backend for drafts. */
export interface DraftStore {
  readAll(): Promise<Record<string, Draft>>;
  writeAll(drafts: Record<string, Draft>): Promise<void>;
}

// ---------------------------------------------------------------------------
// Pure helpers — no I/O, no platform deps
// ---------------------------------------------------------------------------

export function isLocalId(id: string): boolean {
  return id.startsWith("local:");
}

export function newLocalId(): string {
  return `local:${crypto.randomUUID()}`;
}

export function entryToDraft(entry: WorklogEntry, dirty: boolean): Draft {
  return {
    id: entry._id,
    folderId: entry.folderId ?? null,
    title: entry.title,
    date: entry.date,
    contentJson: entry.contentJson,
    contentText: entry.contentText,
    contentHtml: entry.contentHtml,
    tags: entry.tags,
    updatedAt: entry.updatedAt,
    dirty,
    baseVersion: entry.version,
    mode: entry.mode ?? "rich",
  };
}

// ---------------------------------------------------------------------------
// Operations that use DraftStore — shared CRUD logic
// ---------------------------------------------------------------------------

export async function listDrafts(store: DraftStore): Promise<Draft[]> {
  const all = await store.readAll();
  return Object.values(all).sort((a, b) =>
    a.updatedAt < b.updatedAt ? 1 : -1,
  );
}

export async function getDraft(store: DraftStore, id: string): Promise<Draft | null> {
  const all = await store.readAll();
  return all[id] ?? null;
}

export async function saveDraft(store: DraftStore, draft: Draft): Promise<void> {
  const all = await store.readAll();
  all[draft.id] = draft;
  await store.writeAll(all);
}

export async function removeDraft(store: DraftStore, id: string): Promise<void> {
  const all = await store.readAll();
  delete all[id];
  await store.writeAll(all);
}

/** Re-key a draft after the server assigns it a real id (post first sync). */
export async function promoteDraft(store: DraftStore, localId: string, entry: WorklogEntry): Promise<void> {
  const all = await store.readAll();
  delete all[localId];
  all[entry._id] = entryToDraft(entry, false);
  await store.writeAll(all);
}

/** Mirror server entries into the local cache, preserving dirty local drafts. */
export async function cacheEntries(store: DraftStore, entries: WorklogEntry[]): Promise<void> {
  const all = await store.readAll();
  for (const entry of entries) {
    const existing = all[entry._id];
    if (existing?.dirty) continue;
    all[entry._id] = entryToDraft(entry, false);
  }
  await store.writeAll(all);
}
