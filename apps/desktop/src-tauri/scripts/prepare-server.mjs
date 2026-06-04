// Builds the OmniLog server (release) and copies the binary into
// src-tauri/binaries/ so Tauri can bundle it as a resource for the
// "one-click local server" feature.
import { execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url)); // .../src-tauri/scripts
const tauriDir = join(here, "..");                    // .../src-tauri
const serverDir = join(tauriDir, "..", "..", "server"); // apps/server
const isWin = process.platform === "win32";
const exeName = isWin ? "omnilog-server.exe" : "omnilog-server";

const outDir = join(tauriDir, "binaries");
const outExe = join(outDir, exeName); // tauri.conf globs binaries/omnilog-server*

console.log("[prepare-server] building server (release)...");
execSync("cargo build --release", { cwd: serverDir, stdio: "inherit" });

const built = join(serverDir, "target", "release", exeName);
if (!existsSync(built)) {
  throw new Error(`[prepare-server] build output not found: ${built}`);
}
mkdirSync(outDir, { recursive: true });
copyFileSync(built, outExe);
console.log(`[prepare-server] copied ${built} -> ${outExe}`);
