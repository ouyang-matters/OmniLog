# OmniLog Engineering Log

## 2026-06-07 — Android testing, offline mode, connection modes, usage limits, mobile UX

### Android (mobile) build & test environment
- Stood up the full local Android toolchain: JDK 17, Android SDK (platform 34,
  build-tools 34, NDK 26.1.10909125, platform-tools, emulator, x86_64 system
  image), Rust android targets, env vars, AVD `omnilog_test`.
- `tauri android init` scaffolds `apps/mobile/src-tauri/gen/` (generated, now
  gitignored — ~2GB, contains target/ and APK outputs). Regenerate with
  `pnpm tauri android init` after cloning.
- Debug APK build: `pnpm tauri android build --debug --apk --target x86_64`
  (emulator) — output under `gen/android/app/build/outputs/apk/`.

### Bugs fixed
- **Mobile white screen (root cause):** `apps/mobile/src-tauri/tauri.conf.json`
  had no `app.windows` entry, so Tauri v2 created the Android activity but never
  created the `main` WebView — blank screen, zero WebView logs. Added a `main`
  window. This was the real fix.
- **reqwest/OpenSSL cross-compile failure:** mobile `Cargo.toml` now uses
  `default-features = false, features = ["multipart", "rustls-tls", "http2"]`.
- **`crossorigin` on Vite module scripts:** stripped via a `transformIndexHtml`
  plugin in `apps/mobile/vite.config.ts` (hardening for the WebView asset
  protocol).

### Offline mode (purely local, no account, no limits)
- New `packages/shared/src/localClient.ts`: `LocalApiClient extends ApiClient`,
  backed by an on-device `KeyValueStore` (the Tauri store). Drop-in: offline
  mode just swaps `client`, so entries/folders/images/search all work unchanged.
  - Decision: **purely local, never synced.** Images stored inline as data
    URLs. No version history offline.
- New `ServerKind` value `"offline"`. `isConnectionUsable` treats offline as
  connectable; stores branch `clientForConnection()` / `configForConnection()`.
- Mobile + desktop: `createLocalClient()` in each `lib/api.ts`; `startOffline()`
  store action; offline option in the connect/setup UI.

### Connection modes (official / self-hosted / offline)
- Mobile `LoginPage` is now a 3-way chooser (Official with login/register,
  Self-hosted, Offline). First run shows it.
- Mobile Settings → "Mode & connections": shows current mode, switches between
  saved connections, "Add or switch connection" reopens the chooser (new
  `connect` view + Back button) without signing out.
- Desktop already had official/self-hosted/local via `AddConnectionDialog` +
  `ConnectionsTab`; added the offline option to `SetupPage`.

### Usage limits & billing (ThreadLedger-style, server-side)
- `apps/server/src/limits.rs`: `PlanLimits`, `FREE` caps, `effective_limits()`
  → UNLIMITED when billing disabled (self-hosted) or admin/owner, else from the
  stored license plan. Enforced in entries/folders/assets/export/versions with
  `AppError::PaymentRequired` (402).
- Client catches 402 → upgrade prompt (`UpgradeWatcher`, `openBilling`).
- `BillingTab` pay buttons locked (`PAYMENTS_OPEN = false`) until payments open.
- Website pricing page (`deploy/omnilog-pricing.ejs`, `/pricing`).

### Mobile entry-list UX
- New bottom-sheet UI kit `apps/mobile/src/components/ui.tsx`
  (`Sheet`/`ActionSheet`/`PromptSheet`/`ConfirmSheet`/`FolderPickerSheet`).
- `+` opens a Create menu (New note / New folder).
- Per-row `⋯` menu: Rename / Move / Delete (custom prompt, folder picker,
  destructive confirm).
- Monochrome line icons `apps/mobile/src/components/icons.tsx` (replaced emoji).
- Store: `renameEntry`, `moveFolder` added; `updateFolder` accepts `parentId:
  null` (move to root).

### Known next steps (see handoff prompt)
- `+` menu → smaller anchored popover (not full-width sheet).
- Keyboard-overlap on inputs (very frequent on mobile) — global fix.
- Multi-select notes → batch delete (all platforms).
- Free-tier 50MB storage cap incl. images (paid 500MB); usage shown in
  Settings; over-cap → local backup + "not synced" warning.
- User system: email registration with unique per-server `id` + editable
  `displayName`.
