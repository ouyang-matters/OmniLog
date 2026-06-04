/**
 * Mobile platform adapter. Uses Tauri's store plugin for persistence and
 * native fetch for HTTP (no CORS issues on Android WebView with Tauri).
 * No local server — mobile clients connect to self-hosted or official only.
 */
import type { KVStore, PlatformAdapter } from "@omnilog/core";
import { load } from "@tauri-apps/plugin-store";

async function openStore(): Promise<KVStore> {
  const inner = await load("omnilog.settings.json", { autoSave: true, defaults: {} });
  return {
    get: <T>(key: string) => inner.get<T>(key) as Promise<T | null | undefined>,
    set: (key, value) => inner.set(key, value),
    delete: async (key) => { await inner.delete(key); },
    save: () => inner.save(),
  };
}

export const mobilePlatform: PlatformAdapter = {
  kvStore: openStore(),
  // Android WebView can fetch directly; Tauri 2 handles the transport.
  fetch: (input, init) => fetch(input, init),
  // No local server on mobile.
};
