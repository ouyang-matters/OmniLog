/**
 * Tauri-flavoured platform adapter. Wires the core business logic to Tauri's
 * native APIs: Rust-side HTTP (reqwest), plugin-store for persistence, and
 * child-process management for the one-click local server.
 */
import type { KVStore, PlatformAdapter } from "@omnilog/core";
import { load } from "@tauri-apps/plugin-store";
import { invoke } from "@tauri-apps/api/core";
import { rustFetch } from "./lib/api";

async function openStore(): Promise<KVStore> {
  const inner = await load("omnilog.settings.json", { autoSave: true, defaults: {} });
  return {
    get: <T>(key: string) => inner.get<T>(key) as Promise<T | null | undefined>,
    set: (key, value) => inner.set(key, value),
    delete: async (key) => { await inner.delete(key); },
    save: () => inner.save(),
  };
}

export const tauriPlatform: PlatformAdapter = {
  kvStore: openStore(),
  fetch: rustFetch,
  localServer: {
    start: (port, token) =>
      invoke<string>("start_local_server", { opts: { port, token } }),
    stop: () => invoke<void>("stop_local_server").catch(() => undefined),
    isRunning: () => invoke<boolean>("local_server_running").catch(() => false),
    isPortFree: (port) => invoke<boolean>("is_port_free", { port }),
    findFreePort: (start) => invoke<number>("find_free_port", { start }),
    killPort: (port) => invoke<boolean>("kill_port", { port }).catch(() => false),
    defaultDeviceName: () =>
      invoke<string>("default_device_name").catch(() => "My Device"),
  },
};
