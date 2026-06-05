import type { DraftStore, Draft } from "@omnilog/shared";
import {
  isLocalId as _isLocalId,
  newLocalId as _newLocalId,
  entryToDraft as _entryToDraft,
  listDrafts as _listDrafts,
  getDraft as _getDraft,
  saveDraft as _saveDraft,
  removeDraft as _removeDraft,
  promoteDraft as _promoteDraft,
  cacheEntries as _cacheEntries,
} from "@omnilog/shared";
import type { WorklogEntry } from "@omnilog/shared";
import { getStore } from "./store";

export type { Draft } from "@omnilog/shared";

export const isLocalId = _isLocalId;
export const newLocalId = _newLocalId;
export const entryToDraft = _entryToDraft;

const DRAFTS_KEY = "drafts";

const store: DraftStore = {
  async readAll(): Promise<Record<string, Draft>> {
    const s = await getStore();
    return (await s.get<Record<string, Draft>>(DRAFTS_KEY)) ?? {};
  },
  async writeAll(drafts: Record<string, Draft>): Promise<void> {
    const s = await getStore();
    await s.set(DRAFTS_KEY, drafts);
    await s.save();
  },
};

export const listDrafts = () => _listDrafts(store);
export const getDraft = (id: string) => _getDraft(store, id);
export const saveDraft = (draft: Draft) => _saveDraft(store, draft);
export const removeDraft = (id: string) => _removeDraft(store, id);
export const promoteDraft = (localId: string, entry: WorklogEntry) => _promoteDraft(store, localId, entry);
export const cacheEntries = (entries: WorklogEntry[]) => _cacheEntries(store, entries);
