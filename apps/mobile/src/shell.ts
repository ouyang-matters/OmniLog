/**
 * Mobile shell: creates the core store with mobile platform adapter.
 * No local server, no file picker (images via paste/camera in the future).
 */
import { createAppStore } from "@omnilog/core";
import { registerCore, type PlatformUI } from "@omnilog/ui";
import { ApiClient } from "@omnilog/shared";
import { mobilePlatform } from "./platform";

export const core = createAppStore(mobilePlatform);
registerCore(core);

export const mobilePlatformUI: PlatformUI = {
  async openExternal(url: string) {
    // Tauri 2 opener plugin for Android.
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(url);
    } catch {
      window.open(url, "_blank");
    }
  },

  async testConnection(serverUrl: string, apiToken: string) {
    const client = new ApiClient({
      baseUrl: serverUrl,
      token: apiToken,
      fetch: mobilePlatform.fetch,
      timeoutMs: 8000,
    });
    return client.health();
  },

  async defaultDeviceName() {
    return "Android Device";
  },
};
