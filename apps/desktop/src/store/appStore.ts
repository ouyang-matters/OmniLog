/**
 * Desktop appStore — thin shell over `@omnilog/core`. Creates the platform-
 * agnostic store with a Tauri-flavoured platform adapter and re-exports the
 * `useApp` hook + `getClient` helper that every component imports.
 */
import { useStore } from "zustand";
import { createAppStore, type AppState } from "@omnilog/core";
import { tauriPlatform } from "../platform";

const core = createAppStore(tauriPlatform);

// Build a `useApp` hook that matches zustand's `create()` return shape:
//   useApp(selector)    — reactive hook
//   useApp.getState()   — imperative read  (used by SettingsPage billing check)
//   useApp.setState()   — imperative write (used by SettingsPage deep-link)
//   useApp.subscribe()  — manual subscription
const _useApp = <T>(selector: (s: AppState) => T): T =>
  useStore(core.store, selector);

export const useApp = Object.assign(_useApp, {
  getState: core.store.getState,
  setState: core.store.setState,
  subscribe: core.store.subscribe,
});

export function getClient() {
  return core.getClient();
}
