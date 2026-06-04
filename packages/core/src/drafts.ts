import type { EntryMode, WorklogEntry } from "@omnilog/shared";
import type { KVStore } from "./platform.js";

const DRAFTS_KEY = "drafts";

export interface Draft {
  /** Server id once synced; a local `local:<uuid>` id before first sync. */
  id: string;
  folderId: string | null;
  title: string;
  date: string;
  contentJson: unknown;
  contentText: string;
  contentHtml?: string;
  tags: string[];
  updatedAt: string;
  dirty: boolean;
  baseVersion?: number;
  mode?: EntryMode;
}

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

export function createDraftsEngine(kvStoreP: Promise<KVStore>) {
  async function readAll(): Promise<Record<string, Draft>> {
    const store = await kvStoreP;
    return (await store.get<Record<string, Draft>>(DRAFTS_KEY)) ?? {};
  }

  async function writeAll(drafts: Record<string, Draft>): Promise<void> {
    const store = await kvStoreP;
    await store.set(DRAFTS_KEY, drafts);
    await store.save();
  }

  async function listDrafts(): Promise<Draft[]> {
    const all = await readAll();
    return Object.values(all).sort((a, b) =>
      a.updatedAt < b.updatedAt ? 1 : -1,
    );
  }

  async function getDraft(id: string): Promise<Draft | null> {
    const all = await readAll();
    return all[id] ?? null;
  }

  async function saveDraft(draft: Draft): Promise<void> {
    const all = await readAll();
    all[draft.id] = draft;
    await writeAll(all);
  }

  async function removeDraft(id: string): Promise<void> {
    const all = await readAll();
    delete all[id];
    await writeAll(all);
  }

  async function promoteDraft(localId: string, entry: WorklogEntry): Promise<void> {
    const all = await readAll();
    delete all[localId];
    all[entry._id] = entryToDraft(entry, false);
    await writeAll(all);
  }

  async function cacheEntries(entries: WorklogEntry[]): Promise<void> {
    const all = await readAll();
    for (const entry of entries) {
      const existing = all[entry._id];
      if (existing?.dirty) continue;
      all[entry._id] = entryToDraft(entry, false);
    }
    await writeAll(all);
  }

  return { listDrafts, getDraft, saveDraft, removeDraft, promoteDraft, cacheEntries };
}

export type DraftsEngine = ReturnType<typeof createDraftsEngine>;
