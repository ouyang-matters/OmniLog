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
import { createApiClient, rustFetch } from "../lib/api";
import {
  connectionToConfig,
  getDeviceId,
  getPreferredPort,
  isConnectionUsable,
  loadConnections,
  newConnection,
  resetServerConfig,
  saveConnections,
  savePreferredPort,
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
import {
  DEFAULT_LOCAL_PORT,
  defaultDeviceName,
  findFreePort,
  generateToken,
  isPortFree,
  PortInUseError,
  startLocalServer,
  stopLocalServer,
  waitForHealth,
} from "../lib/localServer";

type Phase = "loading" | "setup" | "ready";
type SaveState = "idle" | "saving" | "saved" | "offline" | "error";
type View = "editor" | "settings";

interface AppState {
  phase: Phase;
  /** Synthesised view of the active connection — kept around so existing
   *  callers that read `config` (URL, token, deviceId, managedLocal) keep
   *  working unchanged. Derived; the canonical store is `connections`. */
  config: ServerConfig | null;
  /** All saved server connections (self-hosted + official + local). */
  connections: ServerConnection[];
  /** Id of the connection the client is currently talking to. */
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
  /** Bumped to force the editor to remount (e.g. after a version restore). */
  editorEpoch: number;

  /** The signed-in user (refreshed on connect). null until /auth/me resolves. */
  me: PublicUser | null;
  messages: Message[];

  /** Which top-level view is mounted. Defaults to "editor". */
  view: View;
  /** Optional deep-link target for the settings page (e.g. "connections"). */
  settingsTab: string | null;

  init: () => Promise<void>;
  completeSetup: (cfg: Omit<ServerConfig, "deviceId">) => Promise<void>;
  quickStartLocalServer: (port?: number) => Promise<void>;
  loginAndConnect: (input: { serverUrl: string; username: string; password: string; deviceName: string }) => Promise<void>;
  resetConfig: () => Promise<void>;
  /** Alias for resetConfig — used by the Sign-out button. */
  signOut: () => Promise<void>;
  reconnect: () => Promise<void>;

  // --- Multi-connection management ---
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
  /** Switch the client to a different saved connection. */
  switchConnection: (id: string) => Promise<void>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  loadMe: () => Promise<void>;
  updateProfile: (input: { displayName?: string; avatarDataUrl?: string }) => Promise<void>;
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
  patchCurrent: (patch: Partial<Pick<Draft, "title" | "date" | "tags" | "contentJson" | "contentText" | "contentHtml" | "mode">>) => void;
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

// Held outside reactive state to avoid needless re-renders.
let client: ApiClient | null = null;
let deviceId = "";
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export function getClient(): ApiClient | null {
  return client;
}

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

/** Derive a human-friendly label from a server URL — host without port works
 *  best in the switcher. Falls back to the original string on parse failure. */
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
  editorEpoch: 0,
  me: null,
  messages: [],
  view: "editor",
  settingsTab: null,

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
    // If this is a client-managed local server, re-spawn it before connecting
    // (the process does not survive an app restart).
    if (active.managedLocal) {
      try {
        const port = parsePort(active.serverUrl) ?? DEFAULT_LOCAL_PORT;
        await startLocalServer(port, active.apiToken);
        await waitForHealth(active.serverUrl, active.apiToken, 15000);
      } catch {
        // If it fails to start, we still enter the app in offline mode below.
      }
    }
    const cfg = connectionToConfig(active, deviceId);
    client = createApiClient(cfg);
    set({ phase: "ready", config: cfg });
    await get().refresh();
    await get().loadFolders();
    await get().loadMe();
    await get().loadMessages();
  },

  async quickStartLocalServer(portArg) {
    const port = portArg ?? (await getPreferredPort());

    // Pre-flight: if the port is taken, surface a typed error so the setup page
    // can offer to pick another port or free this one.
    if (!(await isPortFree(port))) {
      const suggested = await findFreePort(port + 1);
      throw new PortInUseError(port, suggested);
    }

    // Reuse the previously generated token if we already provisioned a local
    // server, so its stored data stays accessible. We check the existing
    // connections list rather than the legacy single-config blob.
    const existingLocal = get().connections.find((c) => c.kind === "local-embedded");
    const token =
      existingLocal?.apiToken && existingLocal.managedLocal
        ? existingLocal.apiToken
        : generateToken();
    const deviceName = await defaultDeviceName();
    const url = `http://127.0.0.1:${port}`;

    await startLocalServer(port, token);
    const healthy = await waitForHealth(url, token, 20000);
    if (!healthy) {
      throw new Error(`The local server did not become ready on port ${port}.`);
    }

    // Remember the port as the default, then auto-save the connection info.
    await savePreferredPort(port);
    await get().completeSetup({
      mode: "custom",
      serverUrl: url,
      apiToken: token,
      deviceName,
      managedLocal: true,
    });
  },

  async completeSetup(input) {
    // Route every "first-time" setup through addConnection so the connection
    // is stored and switched to atomically.
    await get().addConnection({
      name:
        input.managedLocal
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
    // Validate credentials and obtain a JWT before persisting anything.
    const probe = new ApiClientClass({
      baseUrl: input.serverUrl,
      token: "",
      fetch: rustFetch,
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
      // offline — keep existing
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
      folders: get().folders.map((f) => (f._id === id ? { ...f, ...updated } : f)),
    });
  },

  async moveFolder(id, parentId) {
    if (!client) return;
    // Backend treats empty string as "move to root".
    const updated = await client.updateFolder(id, { parentId: parentId ?? "" });
    set({
      folders: get().folders.map((f) => (f._id === id ? { ...f, ...updated } : f)),
    });
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
      // Not synced yet — just update the local draft and let the next sync
      // include the new folderId.
      const draft = await getDraft(entryId);
      if (!draft) return;
      const next: Draft = {
        ...draft,
        folderId,
        updatedAt: new Date().toISOString(),
        dirty: true,
      };
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
    // The moved entry no longer belongs to the current folder view.
    const stillVisible = (draft.folderId ?? null) === get().currentFolderId;
    set({
      entries: stillVisible
        ? get().entries.map((e) => (e.id === entryId ? draft : e))
        : get().entries.filter((e) => e.id !== entryId),
      current: get().currentId === entryId ? draft : get().current,
    });
  },

  async resetConfig() {
    // Stop a managed local server if we started one, then wipe ALL saved
    // connections. Used by emergency reset; signOut() is more nuanced.
    if (get().config?.managedLocal) await stopLocalServer();
    await resetServerConfig();
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

  // ----- Multi-connection management -----

  async addConnection(input) {
    const connection = newConnection({
      name: input.name.trim() || connectionLabelFromUrl(input.serverUrl),
      kind: input.kind,
      serverUrl: input.serverUrl.trim(),
      apiToken: input.apiToken,
      deviceName: input.deviceName.trim() || "My Device",
      managedLocal: input.managedLocal,
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

  async renameConnection(id, name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const connections = get().connections.map((c) =>
      c.id === id ? { ...c, name: trimmed } : c,
    );
    await saveConnections({ connections, activeId: get().activeConnectionId });
    set({ connections });
  },

  async removeConnection(id) {
    const removing = get().connections.find((c) => c.id === id);
    const wasActive = get().activeConnectionId === id;
    // Stop managed local before deleting its connection record.
    if (removing?.managedLocal && wasActive) await stopLocalServer();
    const connections = get().connections.filter((c) => c.id !== id);
    const activeId = wasActive
      ? connections[0]?.id ?? null
      : get().activeConnectionId;
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

  async switchConnection(id) {
    const target = get().connections.find((c) => c.id === id);
    if (!target) return;

    // Tear down the current connection.
    const prev = get().connections.find((c) => c.id === get().activeConnectionId);
    if (prev?.managedLocal && prev.id !== id) {
      await stopLocalServer();
    }

    // Spin up the new one if it's managed local.
    if (target.managedLocal) {
      try {
        const port = parsePort(target.serverUrl) ?? DEFAULT_LOCAL_PORT;
        await startLocalServer(port, target.apiToken);
        await waitForHealth(target.serverUrl, target.apiToken, 15000);
      } catch {
        // Will fall through to offline state if it doesn't come up.
      }
    }

    const cfg = connectionToConfig(target, deviceId);
    client = createApiClient(cfg);

    // Record `lastConnectedAt` so the connections list can sort by recency
    // and so we know when the last touch was.
    const stamped = { ...target, lastConnectedAt: new Date().toISOString() };
    const connections = get().connections.map((c) => (c.id === id ? stamped : c));
    await saveConnections({ connections, activeId: id });
    set({
      connections,
      activeConnectionId: id,
      config: cfg,
      phase: "ready",
      // Reset the editor-state slices — they belong to the previous server.
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
    // Detach from the current server without wiping the rest of the saved
    // connections. Stops a managed local server if one is running, keeps the
    // connection row so the user can return to it.
    if (get().config?.managedLocal) await stopLocalServer();
    await saveConnections({
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
      // ignore — offline; UI falls back to whatever was last loaded.
    }
    // For official connections, ask for the license/plan as a best-effort.
    // Self-hosted servers don't implement this endpoint (returns 404), which
    // is fine — we just leave the existing `license` value untouched.
    const active = get().connections.find((c) => c.id === get().activeConnectionId);
    if (active?.kind === "official" && client) {
      try {
        const license = await client.getLicense();
        const connections = get().connections.map((c) =>
          c.id === active.id ? { ...c, license } : c,
        );
        await saveConnections({ connections, activeId: active.id });
        set({ connections });
      } catch {
        // Endpoint missing or rejected; the official service isn't live yet.
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
      // Search is global (across folders); otherwise list the current folder.
      const serverEntries: WorklogEntry[] = q
        ? await client!.search(q)
        : await client!.listEntries({ folderId: folderId ?? undefined });
      await cacheEntries(serverEntries);
      set({ online: true });
    } catch {
      // Server unreachable - fall back to the local cache. Never crash.
      set({ online: false });
    }
    // Always render from the local cache so the UI is identical online/offline.
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
    // If dirty drafts exist and we're back online, flush them.
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
      contentJson: { type: "doc", content: [{ type: "paragraph" }] },
      contentText: "",
      tags: [],
      updatedAt: now,
      dirty: true,
      mode: "rich",
    };
    await saveDraft(draft);
    set({ currentId: id, current: draft, entries: [draft, ...get().entries] });
    scheduleSync(set, get);
  },

  setMode(mode) {
    const cur = get().current;
    if (!cur || cur.mode === mode) return;
    // Switching mode is structural — we clear the rich-text JSON so the new
    // editor doesn't try to render foreign content; existing `contentText` is
    // preserved so a markdown↔latex switch keeps the source.
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
      entries: get().entries.map((e) => (e.id === next.id ? next : e)),
    });
    void saveDraft(next);
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
    // Update in place synchronously so typing is never blocked.
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
    });
  },

  async loadSettings() {
    if (!client) return;
    try {
      set({ settings: await client.getSettings() });
    } catch {
      // ignore — offline; settings panel falls back to a default.
    }
  },

  async setVersioning(enabled) {
    if (!client) return;
    const settings = await client.updateSettings({ versioningEnabled: enabled });
    set({ settings });
  },

  async loadMessages() {
    if (!client) return;
    try {
      const messages = await client.listMessages();
      set({ messages });
    } catch {
      // offline — keep existing
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
      // swallow; the optimistic update is harmless and will be reconciled
      // on next loadMessages.
    }
  },

  async markAllMessagesRead() {
    if (!client) return;
    const at = new Date().toISOString();
    set({
      messages: get().messages.map((m) => (m.readAt ? m : { ...m, readAt: at })),
    });
    try {
      await client.markAllMessagesRead();
    } catch {
      // ignore — optimistic
    }
  },

  async deleteMessage(id) {
    if (!client) return;
    set({ messages: get().messages.filter((m) => m._id !== id) });
    try {
      await client.deleteMessage(id);
    } catch {
      // ignore — the message will reappear on next loadMessages if the call
      // never made it to the server.
    }
  },

  async restoreVersion(version) {
    const id = get().currentId;
    if (!id || !client || isLocalId(id)) return;
    const updated = await client.restoreVersion(id, version);
    await saveDraft(entryToDraft(updated, false));
    set({
      current:
        get().currentId === updated._id ? entryToDraft(updated, false) : get().current,
      entries: get().entries.map((e) =>
        e.id === updated._id ? entryToDraft(updated, false) : e,
      ),
      editorEpoch: get().editorEpoch + 1,
    });
  },

  async toggleTheme() {
    const theme: Theme = get().theme === "dark" ? "light" : "dark";
    applyTheme(theme);
    await saveTheme(theme);
    set({ theme });
  },
}));

/** Debounced push of the current draft to the server (autosave). */
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
        mode: draft.mode ?? "rich",
      });
      await promoteDraft(draft.id, created);
      // Re-key the open editor to the server id.
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
        mode: draft.mode ?? "rich",
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
    // Stay dirty; the edit is safe in the local store. Try again on reconnect.
    set({ online: false, saveState: "offline" });
  }
}

/** Flush all dirty drafts (called after a successful refresh / reconnect). */
async function flushDirty(
  set: (partial: Partial<AppState>) => void,
  get: () => AppState,
) {
  const drafts = await listDrafts();
  for (const d of drafts) {
    if (d.dirty) await syncDraft(set, get, d.id);
  }
}
