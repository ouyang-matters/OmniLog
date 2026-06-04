/**
 * Desktop-only local server helpers. Tauri invoke wrappers used directly by
 * SetupPage / AddConnectionDialog. The core store accesses these same Tauri
 * commands via the PlatformAdapter.localServer interface.
 */
import { invoke } from "@tauri-apps/api/core";

// Re-export from core so existing component imports keep working.
export { PortInUseError, DEFAULT_LOCAL_PORT } from "@omnilog/core";

export function killPort(port: number): Promise<boolean> {
  return invoke<boolean>("kill_port", { port }).catch(() => false);
}

export function defaultDeviceName(): Promise<string> {
  return invoke<string>("default_device_name").catch(() => "My Device");
}
