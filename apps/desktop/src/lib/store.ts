import { load, type Store } from "@tauri-apps/plugin-store";

/**
 * Single persistent store file for OmniLog client settings and local drafts.
 * Lives in the OS app-config directory (managed by Tauri) - never hard-coded.
 */
let storePromise: Promise<Store> | null = null;

export function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = load("omnilog.settings.json", { autoSave: true, defaults: {} });
  }
  return storePromise;
}
