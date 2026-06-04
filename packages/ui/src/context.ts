/**
 * React bridge for @omnilog/core. The host app provides a CoreStore via
 * context; shared UI components consume it via useApp().
 *
 * Also exposes a PlatformUIContext for capabilities that UI components need
 * directly (file picker, external URL opener) — things the zustand store
 * doesn't mediate.
 */
import { createContext, useContext } from "react";
import { useStore } from "zustand";
import type { AppState, CoreStore } from "@omnilog/core";
import type { ApiClient } from "@omnilog/shared";

// ---- Core store context ----

const StoreCtx = createContext<CoreStore | null>(null);

export const CoreProvider = StoreCtx.Provider;

function _useApp<T>(selector: (s: AppState) => T): T {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const core = useContext(StoreCtx);
  if (!core) throw new Error("CoreProvider not found — wrap your app root");
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useStore(core.store, selector);
}

/** Imperative getState / setState matching zustand's `create()` shape.
 *  Used by SettingsPage (billing visibility check, deep-link clear). */
_useApp.getState = () => {
  if (!_core) throw new Error("registerCore() not called");
  return _core.store.getState();
};
_useApp.setState = (partial: Partial<AppState>) => {
  if (!_core) throw new Error("registerCore() not called");
  _core.store.setState(partial);
};

export const useApp = _useApp;

export function useClient(): ApiClient | null {
  const core = useContext(StoreCtx);
  return core?.getClient() ?? null;
}

/** Imperative access for code that runs outside the React tree (TipTap
 *  extensions, non-component utilities). Set once on app startup. */
let _core: CoreStore | null = null;
export function registerCore(core: CoreStore) {
  _core = core;
}
export function getClient(): ApiClient | null {
  return _core?.getClient() ?? null;
}
export function getAppState(): AppState | null {
  return _core?.store.getState() ?? null;
}

// ---- Platform UI context ----

export interface PlatformUI {
  /** Open a file picker. Returns null if cancelled. */
  pickFile?(options?: {
    title?: string;
    filters?: { name: string; extensions: string[] }[];
  }): Promise<{ path: string; name: string; bytes: Uint8Array } | null>;
  /** Read raw bytes from a path the user already chose. */
  readFileBytes?(path: string): Promise<Uint8Array>;
  /** Open a URL in the system browser. */
  openExternal?(url: string): Promise<void>;
  /** Test server connectivity (uses the platform's HTTP transport). */
  testConnection?(
    serverUrl: string,
    apiToken: string,
  ): Promise<{ ok: boolean; name: string; version: string }>;
  /** Kill whatever process is listening on `port`. Desktop only. */
  killPort?(port: number): Promise<boolean>;
  /** Sensible default device name from the OS. */
  defaultDeviceName?(): Promise<string>;
}

const PlatformUICtx = createContext<PlatformUI>({});

export const PlatformUIProvider = PlatformUICtx.Provider;

export function usePlatformUI(): PlatformUI {
  return useContext(PlatformUICtx);
}
