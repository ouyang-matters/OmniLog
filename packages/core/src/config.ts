import type { ServerConfig, ServerConnection } from "@omnilog/shared";
import type { KVStore } from "./platform.js";

const CONFIG_KEY = "serverConfig";
const CONNECTIONS_KEY = "connections";
const ACTIVE_KEY = "activeConnectionId";
const DEVICE_ID_KEY = "deviceId";
const PORT_KEY = "localServerPort";

export const DEFAULT_SERVER_URL = "";

function uuid(): string {
  return crypto.randomUUID();
}

export interface ConnectionsState {
  connections: ServerConnection[];
  activeId: string | null;
}

export function newConnection(
  partial: Partial<ServerConnection> &
    Pick<ServerConnection, "name" | "kind" | "serverUrl" | "apiToken" | "deviceName">,
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

export function isConnectionUsable(
  c: ServerConnection | null | undefined,
): c is ServerConnection {
  return !!c && c.serverUrl.trim().length > 0 && c.apiToken.trim().length > 0;
}

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
  return cfg.serverUrl.trim().length > 0 && cfg.apiToken.trim().length > 0;
}

function safeHostname(s: string): string {
  try {
    return new URL(s).host || "My server";
  } catch {
    return "My server";
  }
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
          : safeHostname(cfg.serverUrl),
    kind,
    serverUrl: cfg.serverUrl,
    apiToken: cfg.apiToken,
    deviceName: cfg.deviceName,
    managedLocal: cfg.managedLocal,
  };
}

async function persistState(store: KVStore, state: ConnectionsState): Promise<void> {
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

export function createConfigManager(kvStoreP: Promise<KVStore>) {
  async function getDeviceId(): Promise<string> {
    const store = await kvStoreP;
    let id = await store.get<string>(DEVICE_ID_KEY);
    if (!id) {
      id = uuid();
      await store.set(DEVICE_ID_KEY, id);
      await store.save();
    }
    return id;
  }

  async function getPreferredPort(): Promise<number> {
    const store = await kvStoreP;
    const p = await store.get<number>(PORT_KEY);
    return typeof p === "number" && p > 0 ? p : 3000;
  }

  async function savePreferredPort(port: number): Promise<void> {
    const store = await kvStoreP;
    await store.set(PORT_KEY, port);
    await store.save();
  }

  async function loadConnections(): Promise<ConnectionsState> {
    const store = await kvStoreP;
    const raw =
      (await store.get<Record<string, ServerConnection>>(CONNECTIONS_KEY)) ?? {};
    let activeId = (await store.get<string>(ACTIVE_KEY)) ?? null;
    const connections = Object.values(raw);

    // Migrate legacy single-server config if no new-format data exists.
    if (connections.length === 0) {
      const legacy = await store.get<ServerConfig>(CONFIG_KEY);
      if (legacy && isLegacyUsable(legacy)) {
        const migrated = legacyToConnection(legacy);
        connections.push(migrated);
        activeId = migrated.id;
        await persistState(store, { connections, activeId });
        await store.delete(CONFIG_KEY);
        await store.save();
      }
    }

    if (activeId && !connections.some((c) => c.id === activeId)) {
      activeId = null;
    }

    return { connections, activeId };
  }

  async function saveConnections(state: ConnectionsState): Promise<void> {
    const store = await kvStoreP;
    await persistState(store, state);
  }

  async function resetServerConfig(): Promise<void> {
    const store = await kvStoreP;
    await store.delete(CONFIG_KEY);
    await store.delete(CONNECTIONS_KEY);
    await store.delete(ACTIVE_KEY);
    await store.save();
  }

  return {
    getDeviceId,
    getPreferredPort,
    savePreferredPort,
    loadConnections,
    saveConnections,
    resetServerConfig,
  };
}

export type ConfigManager = ReturnType<typeof createConfigManager>;
