/**
 * Desktop shell: creates the core store with Tauri adapters and provides the
 * PlatformUI implementation for shared UI components.
 */
import { createAppStore } from "@omnilog/core";
import { registerCore, type PlatformUI } from "@omnilog/ui";
import { ApiClient } from "@omnilog/shared";
import { tauriPlatform } from "./platform";
import { rustFetch } from "./lib/api";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";

export const core = createAppStore(tauriPlatform);

// Register for imperative access (TipTap extensions, non-component code).
registerCore(core);

export const tauriPlatformUI: PlatformUI = {
  async pickFile(options) {
    const selected = await open({
      multiple: false,
      filters: options?.filters?.map((f) => ({
        name: f.name,
        extensions: f.extensions,
      })),
    });
    if (!selected || typeof selected !== "string") return null;
    const bytes = new Uint8Array(
      await invoke<number[]>("read_file_bytes", { path: selected }),
    );
    const name = selected.split(/[/\\]/).pop() || "file";
    return { path: selected, name, bytes };
  },

  async readFileBytes(path: string) {
    return new Uint8Array(
      await invoke<number[]>("read_file_bytes", { path }),
    );
  },

  openExternal(url: string) {
    window.open(url, "_blank");
    return Promise.resolve();
  },

  async testConnection(serverUrl: string, apiToken: string) {
    const client = new ApiClient({
      baseUrl: serverUrl,
      token: apiToken,
      fetch: rustFetch,
      timeoutMs: 8000,
    });
    return client.health();
  },

  killPort(port: number) {
    return invoke<boolean>("kill_port", { port }).catch(() => false);
  },

  defaultDeviceName() {
    return invoke<string>("default_device_name").catch(() => "My Device");
  },
};
