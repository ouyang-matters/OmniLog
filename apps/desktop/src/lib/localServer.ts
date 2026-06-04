import { invoke } from "@tauri-apps/api/core";
import { testConnection } from "./api";

/** Start the bundled local server (embedded storage) on the given port. */
export function startLocalServer(port: number, token: string): Promise<string> {
  return invoke<string>("start_local_server", { opts: { port, token } });
}

export function stopLocalServer(): Promise<void> {
  return invoke<void>("stop_local_server").catch(() => undefined);
}

export function localServerRunning(): Promise<boolean> {
  return invoke<boolean>("local_server_running").catch(() => false);
}

export function isPortFree(port: number): Promise<boolean> {
  return invoke<boolean>("is_port_free", { port });
}

export function findFreePort(start: number): Promise<number> {
  return invoke<number>("find_free_port", { start });
}

/** Kill whatever process is listening on `port`. Returns true if one was killed. */
export function killPort(port: number): Promise<boolean> {
  return invoke<boolean>("kill_port", { port }).catch(() => false);
}

/** Thrown by quickStartLocalServer when the target port is already in use. */
export class PortInUseError extends Error {
  constructor(
    public port: number,
    public suggestedPort: number,
  ) {
    super(`Port ${port} is in use.`);
    this.name = "PortInUseError";
  }
}

export function defaultDeviceName(): Promise<string> {
  return invoke<string>("default_device_name").catch(() => "My Device");
}

/** A strong, opaque API token for the auto-provisioned local server. */
export function generateToken(): string {
  return (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "");
}

/** Poll GET /health until it succeeds or the timeout elapses. */
export async function waitForHealth(
  serverUrl: string,
  token: string,
  timeoutMs = 15000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await testConnection(serverUrl, token);
      if (res.ok) return true;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

export const DEFAULT_LOCAL_PORT = 3000;
export const DEFAULT_LOCAL_URL = `http://127.0.0.1:${DEFAULT_LOCAL_PORT}`;
