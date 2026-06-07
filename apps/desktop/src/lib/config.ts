import type { ServerConfig, ServerConnection } from "@omnilog/shared";
import { getStore } from "./store";

// Tauri store keys.
const CONFIG_KEY = "serverConfig"; // legacy single-server shape (migrated on load)
const CONNECTIONS_KEY = "connections"; // Record<id, ServerConnection>
const ACTIVE_KEY = "activeConnectionId";
const DEVICE_ID_KEY = "deviceId";
const PORT_KEY = "localServerPort";

/**
 * Base URL of the official hosted OmniLog service. The desktop transport runs
 * in Rust (reqwest), so this can be the HTTPS proxy in front of the server.
 * `/health` and `/api/...` are appended by the ApiClient.
 */
export const OFFICIAL_SERVER_URL = "https://dev.aqouyang.com/api/omnilog";

/** @deprecated kept for back-compat; official URL now lives in OFFICIAL_SERVER_URL. */
export const DEFAULT_SERVER_URL = OFFICIAL_SERVER_URL;

function uuid(): string {
  // crypto.randomUUID is available in the Tauri WebView.
  return crypto.randomUUID();
}

/** A stable per-install device id, generated once and persisted. */
export async function getDeviceId(): Promise<string> {
  const store = await getStore();
  let id = await store.get<string>(DEVICE_ID_KEY);
  if (!id) {
    id = uuid();
    await store.set(DEVICE_ID_KEY, id);
    await store.save();
  }
  return id;
}

/** The preferred local-server port, remembered across launches (default 3000). */
export async function getPreferredPort(): Promise<number> {
  const store = await getStore();
  const p = await store.get<number>(PORT_KEY);
  return typeof p === "number" && p > 0 ? p : 3000;
}

export async function savePreferredPort(port: number): Promise<void> {
  const store = await getStore();
  await store.set(PORT_KEY, port);
  await store.save();
}

// ---------- Connections list ----------

interface ConnectionsState {
  connections: ServerConnection[];
  activeId: string | null;
}

/**
 * Load every saved connection plus the currently-active id. The first call
 * after upgrading from the single-server schema migrates the legacy
 * `serverConfig` blob into the list and then deletes the legacy key.
 */
export async function loadConnections(): Promise<ConnectionsState> {
  const store = await getStore();

  const raw = (await store.get<Record<string, ServerConnection>>(CONNECTIONS_KEY)) ?? {};
  let activeId = (await store.get<string>(ACTIVE_KEY)) ?? null;
  const connections = Object.values(raw);

  // Migrate the legacy single config if there's no new-format data yet.
  if (connections.length === 0) {
    const legacy = await store.get<ServerConfig>(CONFIG_KEY);
    if (legacy && isLegacyUsable(legacy)) {
      const migrated = legacyToConnection(legacy);
      connections.push(migrated);
      activeId = migrated.id;
      await persist({ connections, activeId });
      await store.delete(CONFIG_KEY);
      await store.save();
    }
  }

  // Sanity: if activeId points at a deleted connection, drop it.
  if (activeId && !connections.some((c) => c.id === activeId)) {
    activeId = null;
  }

  return { connections, activeId };
}

export async function saveConnections(state: ConnectionsState): Promise<void> {
  await persist(state);
}

async function persist(state: ConnectionsState): Promise<void> {
  const store = await getStore();
  const dict: Record<string, ServerConnection> = {};
  for (const c of state.connections) dict[c.id] = c;
  await store.set(CONNECTIONS_KEY, dict);
  if (state.activeId === null) {
    await store.delete(ACTIVE_KEY);
  } else {
    await store.set(ACTIVE_KEY, state.activeId);
  }
  await store.save();
}

/** Create a fresh, blank connection record. */
export function newConnection(
  partial: Partial<ServerConnection> & Pick<ServerConnection, "name" | "kind" | "serverUrl" | "apiToken" | "deviceName">,
): ServerConnection {
  return {
    id: uuid(),
    name: partial.name,
    kind: partial.kind,
    serverUrl: partial.serverUrl,
    apiToken: partial.apiToken,
    deviceName: partial.deviceName,
    managedLocal: partial.managedLocal,
    lastConnectedAt: partial.lastConnectedAt,
    license: partial.license,
  };
}

/**
 * A connection is "usable" when it has both a URL and a token (or it's a
 * managed-local kind, where we'll spawn the server before connecting).
 */
export function isConnectionUsable(c: ServerConnection | null | undefined): c is ServerConnection {
  if (!c) return false;
  // Offline connections have no URL/token but are always "connectable".
  if (c.kind === "offline") return true;
  return c.serverUrl.trim().length > 0 && c.apiToken.trim().length > 0;
}

/**
 * Synthesize a backward-compatible ServerConfig view of a connection — useful
 * for any older code path that still expects the single-config shape. Drops
 * the per-connection name/license fields.
 */
export function connectionToConfig(
  c: ServerConnection,
  deviceId: string,
): ServerConfig {
  return {
    mode: c.kind === "official" ? "official" : "custom",
    serverUrl: c.serverUrl,
    apiToken: c.apiToken,
    deviceName: c.deviceName,
    deviceId,
    managedLocal: c.managedLocal,
  };
}

function isLegacyUsable(cfg: ServerConfig): boolean {
  return (
    cfg.serverUrl.trim().length > 0 && cfg.apiToken.trim().length > 0
  );
}

function legacyToConnection(cfg: ServerConfig): ServerConnection {
  const kind: ServerConnection["kind"] = cfg.managedLocal
    ? "local-embedded"
    : cfg.mode === "official"
      ? "official"
      : "self-hosted";
  return {
    id: uuid(),
    name:
      kind === "local-embedded"
        ? "Local server"
        : kind === "official"
          ? "Official OmniLog"
          : new URL(safeUrl(cfg.serverUrl)).host || "My server",
    kind,
    serverUrl: cfg.serverUrl,
    apiToken: cfg.apiToken,
    deviceName: cfg.deviceName,
    managedLocal: cfg.managedLocal,
  };
}

function safeUrl(s: string): string {
  try {
    return new URL(s).toString();
  } catch {
    return "http://localhost";
  }
}

// ---------- Legacy shims kept for transitional callers ----------

/**
 * @deprecated Reads from the migrated connections list. Returns the active
 * connection as a ServerConfig so older code paths keep working until they
 * are migrated to `loadConnections`.
 */
export async function loadServerConfig(): Promise<ServerConfig | null> {
  const { connections, activeId } = await loadConnections();
  const active = connections.find((c) => c.id === activeId) ?? null;
  if (!active) return null;
  return connectionToConfig(active, await getDeviceId());
}

/**
 * @deprecated. New code should use the connections list. This wipes
 * everything, equivalent to a sign-out across all servers.
 */
export async function resetServerConfig(): Promise<void> {
  const store = await getStore();
  await store.delete(CONFIG_KEY);
  await store.delete(CONNECTIONS_KEY);
  await store.delete(ACTIVE_KEY);
  await store.save();
}

/** @deprecated. */
export function isConfigUsable(cfg: ServerConfig | null): cfg is ServerConfig {
  return (
    !!cfg &&
    cfg.mode === "custom" &&
    cfg.serverUrl.trim().length > 0 &&
    cfg.apiToken.trim().length > 0
  );
}

/** @deprecated. Use `addOrUpdateConnection` in `appStore` instead. */
export async function saveServerConfig(cfg: ServerConfig): Promise<void> {
  // Treat as an update to the active connection, or create one if none exists.
  const { connections, activeId } = await loadConnections();
  let active = connections.find((c) => c.id === activeId);
  if (!active) {
    active = newConnection({
      name:
        cfg.managedLocal
          ? "Local server"
          : cfg.mode === "official"
            ? "Official OmniLog"
            : "My server",
      kind: cfg.managedLocal
        ? "local-embedded"
        : cfg.mode === "official"
          ? "official"
          : "self-hosted",
      serverUrl: cfg.serverUrl,
      apiToken: cfg.apiToken,
      deviceName: cfg.deviceName,
      managedLocal: cfg.managedLocal,
    });
    connections.push(active);
  } else {
    active.serverUrl = cfg.serverUrl;
    active.apiToken = cfg.apiToken;
    active.deviceName = cfg.deviceName;
    active.managedLocal = cfg.managedLocal;
    if (cfg.mode === "official") active.kind = "official";
  }
  await saveConnections({ connections, activeId: active.id });
}
