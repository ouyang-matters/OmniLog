/**
 * Platform abstraction layer. The host app (desktop, mobile, web) provides
 * concrete implementations of these interfaces. Core business logic depends
 * only on these contracts — never on Tauri, React Native, or other
 * platform-specific APIs.
 */
import type { FetchLike } from "@omnilog/shared";

/**
 * Abstract key-value store. Backed by Tauri plugin-store on desktop, or
 * whatever persistence the platform provides.
 */
export interface KVStore {
  get<T>(key: string): Promise<T | null | undefined>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  save(): Promise<void>;
}

/**
 * Local server lifecycle. Only present on desktop platforms that can spawn
 * child processes. Mobile apps omit this — the core store hides local-server
 * affordances when it is absent.
 */
export interface LocalServerAdapter {
  start(port: number, token: string): Promise<string>;
  stop(): Promise<void>;
  isRunning(): Promise<boolean>;
  isPortFree(port: number): Promise<boolean>;
  findFreePort(start: number): Promise<number>;
  killPort(port: number): Promise<boolean>;
  defaultDeviceName(): Promise<string>;
}

/**
 * Everything the core layer needs from the host platform. Pass an
 * implementation to `createAppStore()`.
 */
export interface PlatformAdapter {
  /** Resolved key-value store (loaded once on startup). */
  kvStore: Promise<KVStore>;
  /** HTTP fetch — desktop routes through Rust; mobile/web use native fetch. */
  fetch: FetchLike;
  /** Local server control. Absent on mobile. */
  localServer?: LocalServerAdapter;
}
