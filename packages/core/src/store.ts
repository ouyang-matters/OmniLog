import { createStore, type StoreApi } from "zustand/vanilla";
import {
  ApiClient,
  type FetchLike,
  type Folder,
  type Message,
  type PublicUser,
  type ServerConfig,
  type ServerConnection,
  type ServerKind,
  type ServerSettings,
  type WorklogEntry,
} from "@omnilog/shared";
import type { PlatformAdapter } from "./platform.js";
import {
  createDraftsEngine,
  type Draft,
  entryToDraft,
  isLocalId,
  newLocalId,
} from "./drafts.js";
import {
  connectionToConfig,
  createConfigManager,
  isConnectionUsable,
  newConnection,
} from "./config.js";
import { applyTheme, createThemeManager, type Theme } from "./theme.js";

export type Phase = "loading" | "setup" | "ready";
export type SaveState = "idle" | "saving" | "saved" | "offline" | "error";
export type View = "editor" | "settings";

export const DEFAULT_LOCAL_PORT = 3000;

export class PortInUseError extends Error {
  constructor(
    public port: number,
    public suggestedPort: number,
  ) {
    super(`Port ${port} is in use.`);
    this.name = "PortInUseError";
  }
}

export interface AppState {
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
  editorEpoch: number;

  me: PublicUser | null;
  messages: Message[];

  view: View;
  settingsTab: string | null;

  /** True when the platform supports local server management. */
  hasLocalServer: boolean;

  init: () => Promise<void>;
  completeSetup: (
    cfg: Omit<ServerConfig, "deviceId">,
  ) => Promise<void>;
  quickStartLocalServer: (port?: number) => Promise<void>;
  loginAndConnect: (input: {
    serverUrl: string;
    username: string;
    password: string;
    deviceName: string;
  }) => Promise<void>;
  resetConfig: () => Promise<void>;
  signOut: () => Promise<void>;
  reconnect: () => Promise<void>;

  addConnection: (input: {
    name: string;
    kind: ServerKind;
    serverUrl: string;
    apiToken: string;
    deviceName: string;
    managedLocal?: boolean;
    activate?: boolean;
  }) => Promise<ServerConnection>;
  renameConnection: (id: string, name: string) => Promise<void>;
  removeConnection: (id: string) => Promise<void>;
  switchConnection: (id: string) => Promise<void>;
  changePassword: (
    oldPassword: string,
    newPassword: string,
  ) => Promise<void>;
  loadMe: () => Promise<void>;
  updateProfile: (input: {
    displayName?: string;
    avatarDataUrl?: string;
  }) => Promise<void>;
  openSettings: () => void;
  closeSettings: () => void;

  loadFolders: () => Promise<void>;
  createFolder: (name: string, parentId: string | null) => Promise<void>;
  renameFolder: (id: string, name: string) => Promise<void>;
  moveFolder: (id: string, parentId: string | null) => Promise<void>;
  deleteFolder: (id: string) => Promise<void>;
  enterFolder: (id: string | null) => Promise<void>;
  moveEntry: (entryId: string, folderId: string | null) => Promise<void>;

  refresh: () => Promise<void>;
  setSearch: (q: string) => Promise<void>;

  selectEntry: (id: string) => Promise<void>;
  createEntry: () => Promise<void>;
  saveNow: () => Promise<void>;
  patchCurrent: (
    patch: Partial<
      Pick<
        Draft,
        | "title"
        | "date"
        | "tags"
        | "contentJson"
        | "contentText"
        | "contentHtml"
        | "mode"
      >
    >,
  ) => void;
  setMode: (mode: "rich" | "latex" | "markdown") => void;
  deleteEntry: (id: string) => Promise<void>;

  loadSettings: () => Promise<void>;
  setVersioning: (enabled: boolean) => Promise<void>;
  restoreVersion: (version: number) => Promise<void>;

  loadMessages: () => Promise<void>;
  markMessageRead: (id: string) => Promise<void>;
  markAllMessagesRead: () => Promise<void>;
  deleteMessage: (id: string) => Promise<void>;

  toggleTheme: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function parsePort(url: string): number | null {
  try {
    const p = new URL(url).port;
    return p ? Number(p) : null;
  } catch {
    return null;
  }
}

function connectionLabelFromUrl(url: string): string {
  try {
    return new URL(url).hostname || url;
  } catch {
    return url;
  }
}

export function generateToken(): string {
  return (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
}

async function waitForHealth(
  serverUrl: string,
  token: string,
  fetchImpl: FetchLike,
  timeoutMs = 15000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const probe = new ApiClient({
        baseUrl: serverUrl,
        token,
        fetch: fetchImpl,
        timeoutMs: 8000,
      });
      const res = await probe.health();
      if (res.ok) return true;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

// ---------------------------------------------------------------------------
// Store factory
// ---------------------------------------------------------------------------

export function createAppStore(platform: PlatformAdapter) {
  const draftOps = createDraftsEngine(platform.kvStore);
  const configOps = createConfigManager(platform.kvStore);
  const themeOps = createThemeManager(platform.kvStore);

  let client: ApiClient | null = null;
  let deviceId = "";
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  function makeClient(cfg: ServerConfig): ApiClient {
    return new ApiClient({
      baseUrl: cfg.serverUrl,
      token: cfg.apiToken,
      fetch: platform.fetch,
    });
  }

  // --- Sync helpers (closed over client / deviceId / draftOps) ---

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
    const draft = await draftOps.getDraft(id);
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
          mode: draft.mode ?? "rich",
        });
        await draftOps.promoteDraft(draft.id, created);
        const wasCurrent = get().currentId === draft.id;
        set({
          online: true,
          saveState: "saved",
          currentId: wasCurrent ? created._id : get().currentId,
          current: wasCurrent
            ? entryToDraft(created, false)
            : get().current,
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
          mode: draft.mode ?? "rich",
          baseVersion: draft.baseVersion,
        });
        await draftOps.saveDraft(entryToDraft(updated, false));
        set({
          online: true,
          saveState: "saved",
          current:
            get().currentId === updated._id
              ? entryToDraft(updated, false)
              : get().current,
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
    const drafts = await draftOps.listDrafts();
    for (const d of drafts) {
      if (d.dirty) await syncDraft(set, get, d.id);
    }
  }

  // --- The store ---

  const store = createStore<AppState>((set, get) => ({
    phase: "loading" as Phase,
    config: null,
    connections: [],
    activeConnectionId: null,
    online: false,
    theme: "light" as Theme,
    entries: [],
    currentId: null,
    current: null,
    saveState: "idle" as SaveState,
    search: "",
    settings: null,
    folders: [],
    currentFolderId: null,
    editorEpoch: 0,
    me: null,
    messages: [],
    view: "editor" as View,
    settingsTab: null,
    hasLocalServer: !!platform.localServer,

    async init() {
      deviceId = await configOps.getDeviceId();
      const theme = await themeOps.loadTheme();
      applyTheme(theme);
      set({ theme });

      const { connections, activeId } = await configOps.loadConnections();
      const active =
        connections.find((c) => c.id === activeId) ?? null;
      set({ connections, activeConnectionId: active?.id ?? null });

      if (!isConnectionUsable(active)) {
        set({ phase: "setup", config: null });
        return;
      }

      if (active.managedLocal && platform.localServer) {
        try {
          const port =
            parsePort(active.serverUrl) ?? DEFAULT_LOCAL_PORT;
          await platform.localServer.start(port, active.apiToken);
          await waitForHealth(
            active.serverUrl,
            active.apiToken,
            platform.fetch,
            15000,
          );
        } catch {
          // Will enter offline mode below.
        }
      }

      const cfg = connectionToConfig(active, deviceId);
      client = makeClient(cfg);
      set({ phase: "ready", config: cfg });
      await get().refresh();
      await get().loadFolders();
      await get().loadMe();
      await get().loadMessages();
    },

    async quickStartLocalServer(portArg) {
      if (!platform.localServer)
        throw new Error(
          "Local server is not available on this platform.",
        );
      const ls = platform.localServer;
      const port = portArg ?? (await configOps.getPreferredPort());

      if (!(await ls.isPortFree(port))) {
        const suggested = await ls.findFreePort(port + 1);
        throw new PortInUseError(port, suggested);
      }

      const existingLocal = get().connections.find(
        (c) => c.kind === "local-embedded",
      );
      const token =
        existingLocal?.apiToken && existingLocal.managedLocal
          ? existingLocal.apiToken
          : generateToken();
      const deviceName = await ls.defaultDeviceName();
      const url = `http://127.0.0.1:${port}`;

      await ls.start(port, token);
      const healthy = await waitForHealth(
        url,
        token,
        platform.fetch,
        20000,
      );
      if (!healthy) {
        throw new Error(
          `The local server did not become ready on port ${port}.`,
        );
      }

      await configOps.savePreferredPort(port);
      await get().completeSetup({
        mode: "custom",
        serverUrl: url,
        apiToken: token,
        deviceName,
        managedLocal: true,
      });
    },

    async completeSetup(input) {
      await get().addConnection({
        name: input.managedLocal
          ? "Local server"
          : input.mode === "official"
            ? "Official OmniLog"
            : connectionLabelFromUrl(input.serverUrl),
        kind: input.managedLocal
          ? "local-embedded"
          : input.mode === "official"
            ? "official"
            : "self-hosted",
        serverUrl: input.serverUrl,
        apiToken: input.apiToken,
        deviceName: input.deviceName,
        managedLocal: input.managedLocal,
        activate: true,
      });
    },

    async loginAndConnect(input) {
      const probe = new ApiClient({
        baseUrl: input.serverUrl,
        token: "",
        fetch: platform.fetch,
        timeoutMs: 8000,
      });
      const res = await probe.login(input.username, input.password);
      await get().completeSetup({
        mode: "custom",
        serverUrl: input.serverUrl,
        apiToken: res.token,
        deviceName: input.deviceName || res.user.username,
      });
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
      set({
        folders: get().folders.map((f) =>
          f._id === id ? { ...f, ...updated } : f,
        ),
      });
    },

    async moveFolder(id, parentId) {
      if (!client) return;
      const updated = await client.updateFolder(id, {
        parentId: parentId ?? "",
      });
      set({
        folders: get().folders.map((f) =>
          f._id === id ? { ...f, ...updated } : f,
        ),
      });
    },

    async deleteFolder(id) {
      if (!client) return;
      await client.deleteFolder(id);
      const folders = get().folders.filter((f) => f._id !== id);
      const leaving = get().currentFolderId === id;
      set({
        folders,
        currentFolderId: leaving ? null : get().currentFolderId,
      });
      if (leaving) await get().refresh();
    },

    async enterFolder(id) {
      set({
        currentFolderId: id,
        currentId: null,
        current: null,
        search: "",
      });
      await get().refresh();
    },

    async moveEntry(entryId, folderId) {
      if (!client) return;
      if (isLocalId(entryId)) {
        const draft = await draftOps.getDraft(entryId);
        if (!draft) return;
        const next: Draft = {
          ...draft,
          folderId,
          updatedAt: new Date().toISOString(),
          dirty: true,
        };
        await draftOps.saveDraft(next);
        set({
          entries: get().entries.map((e) =>
            e.id === entryId ? next : e,
          ),
          current:
            get().currentId === entryId ? next : get().current,
        });
        return;
      }
      const updated = await client.updateEntry(entryId, {
        folderId: folderId ?? "",
      });
      const draft = entryToDraft(updated, false);
      await draftOps.saveDraft(draft);
      const stillVisible =
        (draft.folderId ?? null) === get().currentFolderId;
      set({
        entries: stillVisible
          ? get().entries.map((e) =>
              e.id === entryId ? draft : e,
            )
          : get().entries.filter((e) => e.id !== entryId),
        current:
          get().currentId === entryId ? draft : get().current,
      });
    },

    async resetConfig() {
      if (get().config?.managedLocal && platform.localServer)
        await platform.localServer.stop();
      await configOps.resetServerConfig();
      client = null;
      set({
        phase: "setup",
        config: null,
        connections: [],
        activeConnectionId: null,
        entries: [],
        current: null,
        currentId: null,
        me: null,
        messages: [],
        view: "editor",
      });
    },

    // ---- Multi-connection management ----

    async addConnection(input) {
      const connection = newConnection({
        name:
          input.name.trim() ||
          connectionLabelFromUrl(input.serverUrl),
        kind: input.kind,
        serverUrl: input.serverUrl.trim(),
        apiToken: input.apiToken,
        deviceName: input.deviceName.trim() || "My Device",
        managedLocal: input.managedLocal,
      });
      const existing = get().connections.filter(
        (c) =>
          !(
            c.serverUrl === connection.serverUrl &&
            c.kind === connection.kind
          ),
      );
      const connections = [...existing, connection];
      await configOps.saveConnections({
        connections,
        activeId: input.activate
          ? connection.id
          : get().activeConnectionId,
      });
      set({ connections });
      if (input.activate) {
        await get().switchConnection(connection.id);
      }
      return connection;
    },

    async renameConnection(id, name) {
      const trimmed = name.trim();
      if (!trimmed) return;
      const connections = get().connections.map((c) =>
        c.id === id ? { ...c, name: trimmed } : c,
      );
      await configOps.saveConnections({
        connections,
        activeId: get().activeConnectionId,
      });
      set({ connections });
    },

    async removeConnection(id) {
      const removing = get().connections.find((c) => c.id === id);
      const wasActive = get().activeConnectionId === id;
      if (removing?.managedLocal && wasActive && platform.localServer)
        await platform.localServer.stop();
      const connections = get().connections.filter(
        (c) => c.id !== id,
      );
      const activeId = wasActive
        ? (connections[0]?.id ?? null)
        : get().activeConnectionId;
      await configOps.saveConnections({ connections, activeId });
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

    async switchConnection(id) {
      const target = get().connections.find((c) => c.id === id);
      if (!target) return;

      const prev = get().connections.find(
        (c) => c.id === get().activeConnectionId,
      );
      if (
        prev?.managedLocal &&
        prev.id !== id &&
        platform.localServer
      ) {
        await platform.localServer.stop();
      }

      if (target.managedLocal && platform.localServer) {
        try {
          const port =
            parsePort(target.serverUrl) ?? DEFAULT_LOCAL_PORT;
          await platform.localServer.start(port, target.apiToken);
          await waitForHealth(
            target.serverUrl,
            target.apiToken,
            platform.fetch,
            15000,
          );
        } catch {
          // offline
        }
      }

      const cfg = connectionToConfig(target, deviceId);
      client = makeClient(cfg);

      const stamped = {
        ...target,
        lastConnectedAt: new Date().toISOString(),
      };
      const connections = get().connections.map((c) =>
        c.id === id ? stamped : c,
      );
      await configOps.saveConnections({ connections, activeId: id });
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
      });
      await get().refresh();
      await get().loadFolders();
      await get().loadMe();
      await get().loadMessages();
    },

    async signOut() {
      if (get().config?.managedLocal && platform.localServer)
        await platform.localServer.stop();
      await configOps.saveConnections({
        connections: get().connections,
        activeId: null,
      });
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
        view: "editor",
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
      const active = get().connections.find(
        (c) => c.id === get().activeConnectionId,
      );
      if (active?.kind === "official" && client) {
        try {
          const license = await client.getLicense();
          const connections = get().connections.map((c) =>
            c.id === active.id ? { ...c, license } : c,
          );
          await configOps.saveConnections({
            connections,
            activeId: active.id,
          });
          set({ connections });
        } catch {
          // not live yet
        }
      }
    },

    async updateProfile(input) {
      if (!client) return;
      const updated = await client.updateMe(input);
      set({ me: updated });
    },

    openSettings() {
      set({ view: "settings" });
    },

    closeSettings() {
      set({ view: "editor" });
    },

    async refresh() {
      const q = get().search.trim();
      const folderId = get().currentFolderId;
      try {
        const serverEntries: WorklogEntry[] = q
          ? await client!.search(q)
          : await client!.listEntries({
              folderId: folderId ?? undefined,
            });
        await draftOps.cacheEntries(serverEntries);
        set({ online: true });
      } catch {
        set({ online: false });
      }
      let entries = await draftOps.listDrafts();
      if (q) {
        const needle = q.toLowerCase();
        entries = entries.filter(
          (d) =>
            d.title.toLowerCase().includes(needle) ||
            d.contentText.toLowerCase().includes(needle) ||
            d.tags.some((t) => t.toLowerCase().includes(needle)),
        );
      } else {
        entries = entries.filter(
          (d) => (d.folderId ?? null) === folderId,
        );
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
      const draft = await draftOps.getDraft(id);
      set({ currentId: id, current: draft, saveState: "idle" });
    },

    async createEntry() {
      const id = newLocalId();
      const now = new Date().toISOString();
      const draft: Draft = {
        id,
        folderId: get().currentFolderId,
        title: "",
        date: today(),
        contentJson: {
          type: "doc",
          content: [{ type: "paragraph" }],
        },
        contentText: "",
        tags: [],
        updatedAt: now,
        dirty: true,
        mode: "rich",
      };
      await draftOps.saveDraft(draft);
      set({
        currentId: id,
        current: draft,
        entries: [draft, ...get().entries],
      });
      scheduleSync(set, get);
    },

    setMode(mode) {
      const cur = get().current;
      if (!cur || cur.mode === mode) return;
      const next: Draft = {
        ...cur,
        mode,
        contentJson:
          mode === "rich"
            ? { type: "doc", content: [{ type: "paragraph" }] }
            : cur.contentJson,
        updatedAt: new Date().toISOString(),
        dirty: true,
      };
      set({
        current: next,
        saveState: "saving",
        entries: get().entries.map((e) =>
          e.id === next.id ? next : e,
        ),
      });
      void draftOps.saveDraft(next);
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
      const next: Draft = {
        ...cur,
        ...patch,
        updatedAt: new Date().toISOString(),
        dirty: true,
      };
      set({
        current: next,
        saveState: "saving",
        entries: get().entries.map((e) =>
          e.id === next.id ? next : e,
        ),
      });
      void draftOps.saveDraft(next);
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
      await draftOps.removeDraft(id);
      const entries = get().entries.filter((e) => e.id !== id);
      const clearing = get().currentId === id;
      set({
        entries,
        currentId: clearing ? null : get().currentId,
        current: clearing ? null : get().current,
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

    async setVersioning(enabled) {
      if (!client) return;
      const settings = await client.updateSettings({
        versioningEnabled: enabled,
      });
      set({ settings });
    },

    async loadMessages() {
      if (!client) return;
      try {
        const messages = await client.listMessages();
        set({ messages });
      } catch {
        // offline
      }
    },

    async markMessageRead(id) {
      if (!client) return;
      const at = new Date().toISOString();
      set({
        messages: get().messages.map((m) =>
          m._id === id ? { ...m, readAt: m.readAt ?? at } : m,
        ),
      });
      try {
        await client.markMessageRead(id);
      } catch {
        // swallow
      }
    },

    async markAllMessagesRead() {
      if (!client) return;
      const at = new Date().toISOString();
      set({
        messages: get().messages.map((m) =>
          m.readAt ? m : { ...m, readAt: at },
        ),
      });
      try {
        await client.markAllMessagesRead();
      } catch {
        // ignore
      }
    },

    async deleteMessage(id) {
      if (!client) return;
      set({
        messages: get().messages.filter((m) => m._id !== id),
      });
      try {
        await client.deleteMessage(id);
      } catch {
        // ignore
      }
    },

    async restoreVersion(version) {
      const id = get().currentId;
      if (!id || !client || isLocalId(id)) return;
      const updated = await client.restoreVersion(id, version);
      await draftOps.saveDraft(entryToDraft(updated, false));
      set({
        current:
          get().currentId === updated._id
            ? entryToDraft(updated, false)
            : get().current,
        entries: get().entries.map((e) =>
          e.id === updated._id
            ? entryToDraft(updated, false)
            : e,
        ),
        editorEpoch: get().editorEpoch + 1,
      });
    },

    async toggleTheme() {
      const theme: Theme =
        get().theme === "dark" ? "light" : "dark";
      applyTheme(theme);
      await themeOps.saveTheme(theme);
      set({ theme });
    },
  }));

  return { store, getClient: () => client };
}

export type AppStoreApi = StoreApi<AppState>;
export type CoreStore = ReturnType<typeof createAppStore>;
