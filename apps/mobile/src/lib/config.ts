import type { ServerConfig, ServerConnection } from "@omnilog/shared";
import { getStore } from "./store";

const CONNECTIONS_KEY = "connections";
const ACTIVE_KEY = "activeConnectionId";
const DEVICE_ID_KEY = "deviceId";

function uuid(): string {
  return crypto.randomUUID();
}

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

interface ConnectionsState {
  connections: ServerConnection[];
  activeId: string | null;
}

export async function loadConnections(): Promise<ConnectionsState> {
  const store = await getStore();
  const raw = (await store.get<Record<string, ServerConnection>>(CONNECTIONS_KEY)) ?? {};
  let activeId = (await store.get<string>(ACTIVE_KEY)) ?? null;
  const connections = Object.values(raw);

  if (activeId && !connections.some((c) => c.id === activeId)) {
    activeId = null;
  }

  return { connections, activeId };
}

export async function saveConnections(state: ConnectionsState): Promise<void> {
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

export function newConnection(
  partial: Pick<ServerConnection, "name" | "kind" | "serverUrl" | "apiToken" | "deviceName">,
): ServerConnection {
  return {
    id: uuid(),
    name: partial.name,
    kind: partial.kind,
    serverUrl: partial.serverUrl,
    apiToken: partial.apiToken,
    deviceName: partial.deviceName,
  };
}

export function isConnectionUsable(c: ServerConnection | null | undefined): c is ServerConnection {
  return !!c && c.serverUrl.trim().length > 0 && c.apiToken.trim().length > 0;
}

export function connectionToConfig(c: ServerConnection, deviceId: string): ServerConfig {
  return {
    mode: c.kind === "official" ? "official" : "custom",
    serverUrl: c.serverUrl,
    apiToken: c.apiToken,
    deviceName: c.deviceName,
    deviceId,
  };
}

export async function resetServerConfig(): Promise<void> {
  const store = await getStore();
  await store.delete(CONNECTIONS_KEY);
  await store.delete(ACTIVE_KEY);
  await store.save();
}
