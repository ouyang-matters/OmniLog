import { load, type Store } from "@tauri-apps/plugin-store";

let storePromise: Promise<Store> | null = null;

export function getStore(): Promise<Store> {
  if (!storePromise) {
    storePromise = load("omnilog.settings.json", { autoSave: true, defaults: {} });
  }
  return storePromise;
}
