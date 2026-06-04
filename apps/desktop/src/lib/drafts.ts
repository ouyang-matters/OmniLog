import type { EntryMode, WorklogEntry } from "@omnilog/shared";
import { getStore } from "./store";

const DRAFTS_KEY = "drafts";

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

export function isLocalId(id: string): boolean {
  return id.startsWith("local:");
}

export function newLocalId(): string {
  return `local:${crypto.randomUUID()}`;
}

async function readAll(): Promise<Record<string, Draft>> {
  const store = await getStore();
  return (await store.get<Record<string, Draft>>(DRAFTS_KEY)) ?? {};
}

async function writeAll(drafts: Record<string, Draft>): Promise<void> {
  const store = await getStore();
  await store.set(DRAFTS_KEY, drafts);
  await store.save();
}

export async function listDrafts(): Promise<Draft[]> {
  const all = await readAll();
  return Object.values(all).sort((a, b) =>
    a.updatedAt < b.updatedAt ? 1 : -1,
  );
}

export async function getDraft(id: string): Promise<Draft | null> {
  const all = await readAll();
  return all[id] ?? null;
}

export async function saveDraft(draft: Draft): Promise<void> {
  const all = await readAll();
  all[draft.id] = draft;
  await writeAll(all);
}

export async function removeDraft(id: string): Promise<void> {
  const all = await readAll();
  delete all[id];
  await writeAll(all);
}

/** Re-key a draft after the server assigns it a real id (post first sync). */
export async function promoteDraft(localId: string, entry: WorklogEntry): Promise<void> {
  const all = await readAll();
  delete all[localId];
  all[entry._id] = entryToDraft(entry, false);
  await writeAll(all);
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

/** Mirror server entries into the local cache, preserving dirty local drafts. */
export async function cacheEntries(entries: WorklogEntry[]): Promise<void> {
  const all = await readAll();
  for (const entry of entries) {
    const existing = all[entry._id];
    // Never overwrite an unsynced local edit with the server copy.
    if (existing?.dirty) continue;
    all[entry._id] = entryToDraft(entry, false);
  }
  await writeAll(all);
}
