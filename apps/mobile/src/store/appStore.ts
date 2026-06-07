import { create } from "zustand";
import type {
  ApiClient,
  Folder,
  Message,
  PublicUser,
  ServerConfig,
  ServerConnection,
  ServerKind,
  ServerSettings,
  WorklogEntry,
} from "@omnilog/shared";
import { ApiClient as ApiClientClass } from "@omnilog/shared";
import { createApiClient, createLocalClient, rustFetch } from "../lib/api";
import {
  connectionToConfig,
  getDeviceId,
  isConnectionUsable,
  loadConnections,
  newConnection,
  OFFICIAL_SERVER_URL,
  saveConnections,
} from "../lib/config";
import {
  cacheEntries,
  type Draft,
  entryToDraft,
  getDraft,
  isLocalId,
  listDrafts,
  newLocalId,
  promoteDraft,
  removeDraft,
  saveDraft,
} from "../lib/drafts";
import { applyTheme, loadTheme, saveTheme, type Theme } from "../lib/theme";

type Phase = "loading" | "setup" | "ready";
type SaveState = "idle" | "saving" | "saved" | "offline" | "error";
type MobileView = "list" | "editor" | "settings" | "connect";

interface AppState {
  phase: Phase;
  config: ServerConfig | null;
  connections: ServerConnection[];
  activeConnectionId: string | null;
  online: boolean;
  theme: Theme;

  entries: Draft[];
  currentId: string | null;
  current: Draft | null;
  saveState: SaveState;
  search: string;
  settings: ServerSettings | null;
  folders: Folder[];
  currentFolderId: string | null;

  me: PublicUser | null;
  messages: Message[];

  view: MobileView;

  init: () => Promise<void>;
  loginAndConnect: (input: {
    serverUrl: string;
    username: string;
    password: string;
    deviceName: string;
    kind?: ServerKind;
    name?: string;
  }) => Promise<void>;
  registerAndConnect: (input: {
    username: string;
    email: string;
    password: string;
    deviceName: string;
  }) => Promise<{ message: string }>;
  startOffline: () => Promise<void>;
  addConnection: (input: {
    name: string;
    kind: ServerKind;
    serverUrl: string;
    apiToken: string;
    deviceName: string;
    activate?: boolean;
  }) => Promise<ServerConnection>;
  switchConnection: (id: string) => Promise<void>;
  removeConnection: (id: string) => Promise<void>;
  signOut: () => Promise<void>;
  reconnect: () => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  loadMe: () => Promise<void>;
  updateProfile: (input: { displayName?: string; avatarDataUrl?: string }) => Promise<void>;

  loadFolders: () => Promise<void>;
  createFolder: (name: string, parentId: string | null) => Promise<void>;
  renameFolder: (id: string, name: string) => Promise<void>;
  moveFolder: (id: string, parentId: string | null) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  enterFolder: (id: string | null) => Promise<void>;
  moveEntry: (entryId: string, folderId: string | null) => Promise<void>;
  renameEntry: (id: string, title: string) => Promise<void>;

  refresh: () => Promise<void>;
  setSearch: (q: string) => Promise<void>;

  selectEntry: (id: string) => Promise<void>;
  createEntry: () => Promise<void>;
  saveNow: () => Promise<void>;
  patchCurrent: (patch: Partial<Pick<Draft, "title" | "date" | "tags" | "contentJson" | "contentText">>) => void;
  deleteEntry: (id: string) => Promise<void>;

  loadSettings: () => Promise<void>;
  loadMessages: () => Promise<void>;
  markMessageRead: (id: string) => Promise<void>;
  markAllMessagesRead: () => Promise<void>;
  deleteMessage: (id: string) => Promise<void>;

  toggleTheme: () => Promise<void>;
  navigate: (view: MobileView) => void;
  goBack: () => void;
}

let client: ApiClient | null = null;
let deviceId = "";
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function getClient(): ApiClient | null {
  return client;
}

/** Build the right client for a connection: a local store for offline, else HTTP. */
function clientForConnection(c: ServerConnection): ApiClient | null {
  if (c.kind === "offline") return createLocalClient(deviceId);
  if (!isConnectionUsable(c)) return null;
  return createApiClient(connectionToConfig(c, deviceId));
}

function configForConnection(c: ServerConnection): ServerConfig | null {
  return c.kind === "offline" ? null : connectionToConfig(c, deviceId);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function connectionLabelFromUrl(url: string): string {
  try {
    return new URL(url).hostname || url;
  } catch {
    return url;
  }
}

export const useApp = create<AppState>((set, get) => ({
  phase: "loading",
  config: null,
  connections: [],
  activeConnectionId: null,
  online: false,
  theme: "light",
  entries: [],
  currentId: null,
  current: null,
  saveState: "idle",
  search: "",
  settings: null,
  folders: [],
  currentFolderId: null,
  me: null,
  messages: [],
  view: "list",

  async init() {
    deviceId = await getDeviceId();
    const theme = await loadTheme();
    applyTheme(theme);
    set({ theme });

    const { connections, activeId } = await loadConnections();
    const active = connections.find((c) => c.id === activeId) ?? null;
    set({ connections, activeConnectionId: active?.id ?? null });

    if (!isConnectionUsable(active)) {
      set({ phase: "setup", config: null });
      return;
    }
    client = clientForConnection(active);
    set({ phase: "ready", config: configForConnection(active) });
    await get().refresh();
    await get().loadFolders();
    await get().loadMe();
    await get().loadMessages();
  },

  async loginAndConnect(input) {
    const kind: ServerKind = input.kind ?? "self-hosted";
    const probe = new ApiClientClass({
      baseUrl: input.serverUrl,
      token: "",
      fetch: rustFetch,
      timeoutMs: 15000,
    });
    const res = await probe.login(input.username, input.password);
    await get().addConnection({
      name:
        input.name?.trim() ||
        (kind === "official" ? "Official OmniLog" : connectionLabelFromUrl(input.serverUrl)),
      kind,
      serverUrl: input.serverUrl,
      apiToken: res.token,
      deviceName: input.deviceName || res.user.username,
      activate: true,
    });
  },

  async registerAndConnect(input) {
    const probe = new ApiClientClass({
      baseUrl: OFFICIAL_SERVER_URL,
      token: "",
      fetch: rustFetch,
      timeoutMs: 15000,
    });
    const res = await probe.register(input.username, input.email, input.password);
    // Some servers require email verification before login succeeds; try to log
    // in immediately and, if that fails, surface the server's message.
    try {
      await get().loginAndConnect({
        serverUrl: OFFICIAL_SERVER_URL,
        username: input.username,
        password: input.password,
        deviceName: input.deviceName,
        kind: "official",
        name: "Official OmniLog",
      });
    } catch {
      // Login not yet possible (e.g. verification pending) — leave setup as-is.
    }
    return { message: res.message };
  },

  async startOffline() {
    await get().addConnection({
      name: "Offline (this device)",
      kind: "offline",
      serverUrl: "",
      apiToken: "",
      deviceName: "This device",
      activate: true,
    });
  },

  async addConnection(input) {
    const connection = newConnection({
      name: input.name.trim() || connectionLabelFromUrl(input.serverUrl),
      kind: input.kind,
      serverUrl: input.serverUrl.trim(),
      apiToken: input.apiToken,
      deviceName: input.deviceName.trim() || "My Device",
    });
    const existing = get().connections.filter(
      (c) => !(c.serverUrl === connection.serverUrl && c.kind === connection.kind),
    );
    const connections = [...existing, connection];
    await saveConnections({
      connections,
      activeId: input.activate ? connection.id : get().activeConnectionId,
    });
    set({ connections });
    if (input.activate) {
      await get().switchConnection(connection.id);
    }
    return connection;
  },

  async switchConnection(id) {
    const target = get().connections.find((c) => c.id === id);
    if (!target) return;
    const cfg = configForConnection(target);
    client = clientForConnection(target);

    const stamped = { ...target, lastConnectedAt: new Date().toISOString() };
    const connections = get().connections.map((c) => (c.id === id ? stamped : c));
    await saveConnections({ connections, activeId: id });
    set({
      connections,
      activeConnectionId: id,
      config: cfg,
      phase: "ready",
      entries: [],
      current: null,
      currentId: null,
      currentFolderId: null,
      me: null,
      messages: [],
      folders: [],
      search: "",
      view: "list",
    });
    await get().refresh();
    await get().loadFolders();
    await get().loadMe();
    await get().loadMessages();
  },

  async removeConnection(id) {
    const wasActive = get().activeConnectionId === id;
    const connections = get().connections.filter((c) => c.id !== id);
    const activeId = wasActive ? connections[0]?.id ?? null : get().activeConnectionId;
    await saveConnections({ connections, activeId });
    if (wasActive) {
      client = null;
      set({
        connections,
        activeConnectionId: activeId,
        config: null,
        entries: [],
        current: null,
        currentId: null,
        me: null,
        messages: [],
        phase: activeId ? "ready" : "setup",
      });
      if (activeId) await get().switchConnection(activeId);
    } else {
      set({ connections });
    }
  },

  async signOut() {
    await saveConnections({ connections: get().connections, activeId: null });
    client = null;
    set({
      phase: "setup",
      config: null,
      activeConnectionId: null,
      entries: [],
      current: null,
      currentId: null,
      me: null,
      messages: [],
      folders: [],
      currentFolderId: null,
      view: "list",
    });
  },

  async reconnect() {
    await get().refresh();
    await get().loadMessages();
  },

  async changePassword(oldPassword, newPassword) {
    if (!client) throw new Error("Not connected.");
    await client.changePassword({ oldPassword, newPassword });
  },

  async loadMe() {
    if (!client) return;
    try {
      const me = await client.me();
      set({ me });
    } catch {
      // offline
    }
  },

  async updateProfile(input) {
    if (!client) return;
    const updated = await client.updateMe(input);
    set({ me: updated });
  },

  async loadFolders() {
    if (!client) return;
    try {
      set({ folders: await client.listFolders() });
    } catch {
      // offline
    }
  },

  async createFolder(name, parentId) {
    if (!client) return;
    const folder = await client.createFolder({ name, parentId });
    set({ folders: [...get().folders, folder] });
  },

  async renameFolder(id, name) {
    if (!client) return;
    const updated = await client.updateFolder(id, { name });
    set({ folders: get().folders.map((f) => (f._id === id ? { ...f, ...updated } : f)) });
  },

  async moveFolder(id, parentId) {
    if (!client) return;
    // Guard against moving a folder into itself.
    if (id === parentId) return;
    const updated = await client.updateFolder(id, { parentId });
    set({ folders: get().folders.map((f) => (f._id === id ? { ...f, ...updated } : f)) });
  },

  async deleteFolder(id) {
    if (!client) return;
    await client.deleteFolder(id);
    const folders = get().folders.filter((f) => f._id !== id);
    const leaving = get().currentFolderId === id;
    set({ folders, currentFolderId: leaving ? null : get().currentFolderId });
    if (leaving) await get().refresh();
  },

  async enterFolder(id) {
    set({ currentFolderId: id, currentId: null, current: null, search: "" });
    await get().refresh();
  },

  async moveEntry(entryId, folderId) {
    if (!client) return;
    if (isLocalId(entryId)) {
      const draft = await getDraft(entryId);
      if (!draft) return;
      const next: Draft = { ...draft, folderId, updatedAt: new Date().toISOString(), dirty: true };
      await saveDraft(next);
      set({
        entries: get().entries.map((e) => (e.id === entryId ? next : e)),
        current: get().currentId === entryId ? next : get().current,
      });
      return;
    }
    const updated = await client.updateEntry(entryId, { folderId: folderId ?? "" });
    const draft = entryToDraft(updated, false);
    await saveDraft(draft);
    const stillVisible = (draft.folderId ?? null) === get().currentFolderId;
    set({
      entries: stillVisible
        ? get().entries.map((e) => (e.id === entryId ? draft : e))
        : get().entries.filter((e) => e.id !== entryId),
      current: get().currentId === entryId ? draft : get().current,
    });
  },

  async renameEntry(id, title) {
    const draft = await getDraft(id);
    if (!draft) return;
    const next: Draft = { ...draft, title, updatedAt: new Date().toISOString(), dirty: true };
    await saveDraft(next);
    set({
      entries: get().entries.map((e) => (e.id === id ? next : e)),
      current: get().currentId === id ? next : get().current,
    });
    await syncDraft(set, get, id);
  },

  async refresh() {
    const q = get().search.trim();
    const folderId = get().currentFolderId;
    try {
      const serverEntries: WorklogEntry[] = q
        ? await client!.search(q)
        : await client!.listEntries({ folderId: folderId ?? undefined });
      await cacheEntries(serverEntries);
      set({ online: true });
    } catch {
      set({ online: false });
    }
    let entries = await listDrafts();
    if (q) {
      const needle = q.toLowerCase();
      entries = entries.filter(
        (d) =>
          d.title.toLowerCase().includes(needle) ||
          d.contentText.toLowerCase().includes(needle) ||
          d.tags.some((t) => t.toLowerCase().includes(needle)),
      );
    } else {
      entries = entries.filter((d) => (d.folderId ?? null) === folderId);
    }
    set({ entries });
    if (get().online) {
      void flushDirty(set, get);
      if (!get().settings) void get().loadSettings();
    }
  },

  async setSearch(qRaw) {
    set({ search: qRaw });
    await get().refresh();
  },

  async selectEntry(id) {
    const draft = await getDraft(id);
    set({ currentId: id, current: draft, saveState: "idle", view: "editor" });
  },

  async createEntry() {
    const id = newLocalId();
    const now = new Date().toISOString();
    const draft: Draft = {
      id,
      folderId: get().currentFolderId,
      title: "",
      date: today(),
      contentJson: { type: "doc", content: [{ type: "paragraph" }] },
      contentText: "",
      tags: [],
      updatedAt: now,
      dirty: true,
      mode: "markdown",
    };
    await saveDraft(draft);
    set({ currentId: id, current: draft, entries: [draft, ...get().entries], view: "editor" });
    scheduleSync(set, get);
  },

  async saveNow() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    await syncDraft(set, get, get().currentId);
  },

  patchCurrent(patch) {
    const cur = get().current;
    if (!cur) return;
    const next: Draft = { ...cur, ...patch, updatedAt: new Date().toISOString(), dirty: true };
    set({
      current: next,
      saveState: "saving",
      entries: get().entries.map((e) => (e.id === next.id ? next : e)),
    });
    void saveDraft(next);
    scheduleSync(set, get);
  },

  async deleteEntry(id) {
    if (!isLocalId(id) && client) {
      try {
        await client.deleteEntry(id);
      } catch {
        set({ online: false });
      }
    }
    await removeDraft(id);
    const entries = get().entries.filter((e) => e.id !== id);
    const clearing = get().currentId === id;
    set({
      entries,
      currentId: clearing ? null : get().currentId,
      current: clearing ? null : get().current,
      view: clearing ? "list" : get().view,
    });
  },

  async loadSettings() {
    if (!client) return;
    try {
      set({ settings: await client.getSettings() });
    } catch {
      // offline
    }
  },

  async loadMessages() {
    if (!client) return;
    try {
      set({ messages: await client.listMessages() });
    } catch {
      // offline
    }
  },

  async markMessageRead(id) {
    if (!client) return;
    const at = new Date().toISOString();
    set({ messages: get().messages.map((m) => (m._id === id ? { ...m, readAt: m.readAt ?? at } : m)) });
    try { await client.markMessageRead(id); } catch { /* optimistic */ }
  },

  async markAllMessagesRead() {
    if (!client) return;
    const at = new Date().toISOString();
    set({ messages: get().messages.map((m) => (m.readAt ? m : { ...m, readAt: at })) });
    try { await client.markAllMessagesRead(); } catch { /* optimistic */ }
  },

  async deleteMessage(id) {
    if (!client) return;
    set({ messages: get().messages.filter((m) => m._id !== id) });
    try { await client.deleteMessage(id); } catch { /* optimistic */ }
  },

  async toggleTheme() {
    const theme: Theme = get().theme === "dark" ? "light" : "dark";
    applyTheme(theme);
    await saveTheme(theme);
    set({ theme });
  },

  navigate(view) {
    set({ view });
  },

  goBack() {
    const v = get().view;
    if (v === "connect") {
      set({ view: "settings" });
    } else if (v === "editor" || v === "settings") {
      set({ view: "list" });
    }
  },
}));

function scheduleSync(
  set: (partial: Partial<AppState>) => void,
  get: () => AppState,
) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void syncDraft(set, get, get().currentId);
  }, 800);
}

async function syncDraft(
  set: (partial: Partial<AppState>) => void,
  get: () => AppState,
  id: string | null,
) {
  if (!id || !client) return;
  const draft = await getDraft(id);
  if (!draft || !draft.dirty) return;

  try {
    if (isLocalId(draft.id)) {
      const created = await client.createEntry({
        folderId: draft.folderId,
        title: draft.title,
        date: draft.date,
        contentJson: draft.contentJson,
        contentText: draft.contentText,
        contentHtml: draft.contentHtml,
        tags: draft.tags,
        deviceId,
        mode: draft.mode ?? "markdown",
      });
      await promoteDraft(draft.id, created);
      const wasCurrent = get().currentId === draft.id;
      set({
        online: true,
        saveState: "saved",
        currentId: wasCurrent ? created._id : get().currentId,
        current: wasCurrent ? entryToDraft(created, false) : get().current,
        entries: get().entries.map((e) =>
          e.id === draft.id ? entryToDraft(created, false) : e,
        ),
      });
    } else {
      const updated = await client.updateEntry(draft.id, {
        title: draft.title,
        date: draft.date,
        contentJson: draft.contentJson,
        contentText: draft.contentText,
        contentHtml: draft.contentHtml,
        tags: draft.tags,
        deviceId,
        mode: draft.mode ?? "markdown",
        baseVersion: draft.baseVersion,
      });
      await saveDraft(entryToDraft(updated, false));
      set({
        online: true,
        saveState: "saved",
        current:
          get().currentId === updated._id ? entryToDraft(updated, false) : get().current,
        entries: get().entries.map((e) =>
          e.id === updated._id ? entryToDraft(updated, false) : e,
        ),
      });
    }
  } catch {
    set({ online: false, saveState: "offline" });
  }
}

async function flushDirty(
  set: (partial: Partial<AppState>) => void,
  get: () => AppState,
) {
  const drafts = await listDrafts();
  for (const d of drafts) {
    if (d.dirty) await syncDraft(set, get, d.id);
  }
}
