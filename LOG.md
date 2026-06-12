# Engineering Log

A running journal of changes to OmniLog. Newest entries on top.

---

## 2026-06-04: revert the editor padding / border CSS pass

### Reverted
- `aa4c663` "style: more editor top padding, visible source-mode
  borders" backed out per Owen's request. The editor pane padding,
  `scrollbar-gutter: stable`, source-input border thickness, and
  related tweaks return to the values that shipped with the
  modularisation merge (`cb19b28`).

### Notes
- Used `git revert` so the original commit stays in history; the
  revert lands as a new commit on top of `developing` rather than
  rewriting it.
- No follow-up CSS pass attempted. If the padding / border
  complaints from earlier come back, we should diagnose by running
  the app first instead of guessing from the stylesheet.

---

## 2026-06-04: superuser support + user email field

### Added
- `Config` reads four new env vars: `SUPERUSER_USERNAMES` (comma-
  separated), `SUPERUSER_EMAIL`, `SUPERUSER_DISPLAY_NAME`,
  `SUPERUSER_PASSWORD`. `Config::is_superuser(username)` answers the
  hot check used by billing and user-management endpoints.
- `User` gets an optional `email` field. Mirrored on `PublicUser`,
  `CreateUserInput`, `UpdateUserInput`, `UpdateMeInput`, and the
  TypeScript `PublicUser` plus the api-client method signatures.
- `License::superuser_unlimited(user_id, now)` returns an
  unexpiring `team`-tier license with extra `superuser` and
  `unlimited` feature flags so the client can switch on them.
- `bootstrap_superusers` runs after `bootstrap_admin` on every
  server start. Idempotent: only creates rows that don't already
  exist. The first username in the list gets the email + display
  name + password from env vars at seed time; later names get a
  random placeholder password (must be reset by the owner before
  login).
- `GET /api/auth/license` short-circuits to the unlimited license
  whenever the caller is on the superuser list, regardless of
  Stripe state.
- `POST /api/billing/checkout` refuses to start a checkout for a
  superuser (no subscription needed).
- `PATCH /api/users/:id` refuses to edit a superuser unless the
  caller is also a superuser. `DELETE /api/users/:id` refuses to
  delete a superuser at all; the operator removes the entry from
  `SUPERUSER_USERNAMES` and restarts the server instead.

### Notes
- **Personal data is NOT in the repository.** Username, email,
  display name, and password for any superuser live in env vars on
  the deployment host. `.env.example` shows the variable names with
  empty values; the operator fills them in locally.
- This change was written but not compiled (toolchain still
  missing on the Windows dev box). Compile pass will happen on the
  Linux workstation along with the existing backlog from sessions
  1 through 6 and the modularisation merge.
- Migration concern: existing `User` rows on a populated database
  won't have the `email` field. `#[serde(default)]` on the field
  means BSON / JSON deserialisation will fill `None` for them, so
  no explicit migration is required.
- Privacy aside: the operator's commit-author email is already in
  git history (set globally), but the API surface, code, and docs
  carry no PII. Searching the public repo for the seeded username
  will turn up nothing.

---

## 2026-06-04: handoff to a different device; defer first compile

### Notes
- Owen is signing off on the Windows workstation and continuing on
  another device when he gets home. No code changes this turn beyond
  the prior em-dash pass; this entry is a checkpoint so whoever picks
  up next knows the state without re-reading every prior session.
- Repo state: `developing` is in sync with `origin/developing` at
  `53cca0b`. Last code work was the modularisation merge on the Linux
  side (`cb19b28`); the Windows side only contributed a README
  typography fix on top.
- Build status: still no compile pass has been run on the code added in
  sessions 1 through 6 (multi-user, sharing, notifications, multi-mode
  editor, multi-connection client, Stripe billing) or on the
  modularisation refactor. First build will almost certainly surface
  type and import errors that need clearing up before a portable can
  ship.

### Next session, pick this up

1. Pull the latest `developing` branch.
2. Confirm the toolchain is set up on the host (`rustc`, `cargo`,
   `pnpm`, `cargo tauri`, JDK 17+ if doing Android, Android SDK + NDK
   if doing Android). The disk-cleanup + install prompts I gave Owen
   earlier in the conversation cover the Linux Ubuntu 22.04 path.
3. `pnpm install` from the repo root, then in order:
   - `pnpm typecheck` first (cheap; surfaces TS errors fast).
   - `cargo check --manifest-path apps/server/Cargo.toml` (Rust
     server side; will be the slowest first time because of the
     reqwest + mongo + axum + image deps tree).
   - `pnpm --filter @omnilog/desktop tauri build` for the Linux
     portable AppImage / deb.
   - `pnpm --filter @omnilog/mobile tauri android build` if the
     Android toolchain is in place.
4. Fix compile errors on a `fix/first-build` branch. Don't push fixes
   to `developing` directly; open a PR so Owen can review the diff in
   one place.
5. Append a LOG.md entry covering what built, what didn't, and what
   was fixed. The no-em-dash rule still applies.

### Windows portable specifically
- Producing a Windows portable still needs a Windows host. The Linux
  build host cannot cross-compile a Tauri Windows binary without
  significant effort (MinGW, NSIS, etc.). Plan: once the Linux build
  is green, install the Windows toolchain on this box and rebuild
  here. Estimated 30 to 60 minutes once Linux side is known-good.

---

## 2026-06-04: pulled the Linux modularisation; README typography pass

### Changed
- Synced this clone with the Linux workstation's modularisation work
  that landed on `origin/developing` while I was off doing local edits.
  The shared layer (`packages/core`, `packages/ui`) is now the canonical
  home for business logic and reusable components; the old paths under
  `apps/desktop/src/` are kept as thin re-export shims.
- README had picked up 10 em-dash characters again in the merged
  version. Re-scrubbed them with colons / semicolons / sentence breaks.
  No content changes. The no-em-dash rule applies to anything I write,
  so keeping this enforced.

### Notes
- My two earlier local commits (sidebar simplification and previous
  em-dash scrub) were superseded by the force-pushed modularisation on
  `origin/developing`. They live on `backup-windows-side` branch if we
  want to cherry-pick anything back. The old `apps/desktop/src/components/`
  directory is gone, so the sidebar simplification cannot replay
  in-place; if we want the trimmed sidebar back, it has to be re-applied
  to `packages/ui/src/Sidebar.tsx` (the new home, currently the full
  293-line version).
- Tried to build a Windows portable on this box. Toolchain remains
  absent on this machine: `cargo`, `rustup`, `pnpm`, and `tauri-cli`
  are not installed; only `node` is present. A first compile pass would
  need rustup, MSVC Build Tools (about 6 GB), pnpm, and cargo-tauri,
  plus 10 to 30 minutes of cold compile across the new server deps
  (reqwest with rustls, image processing, mongo driver). Given how much
  has changed across sessions 1 through 6 without a build pass, the
  first compile will surface type and build errors that need cleaning
  up. Recommend deferring the first build to the Linux workstation,
  which has the horsepower to make it painless; produce Windows
  portables from a Windows host later once the Linux side is green.

---

## 2026-06-04 — Modularisation + Linux desktop + Android mobile

### Added

- **`packages/core/`** — framework-agnostic TypeScript package containing all
  business logic previously embedded in `apps/desktop/src/`.
  - `platform.ts`: `KVStore`, `LocalServerAdapter`, `PlatformAdapter` interfaces
    — the host app injects platform-specific implementations.
  - `drafts.ts`: `Draft` type + engine (create, list, cache, promote), parameterized
    by `KVStore`. Relocated from `apps/desktop/src/lib/drafts.ts`.
  - `config.ts`: connection management (multi-server list, migration from legacy
    single-config, preferred port). Relocated from `apps/desktop/src/lib/config.ts`.
  - `theme.ts`: theme persistence + `applyTheme()`. Relocated from
    `apps/desktop/src/lib/theme.ts`.
  - `store.ts`: `createAppStore(platform)` — the entire 900-line zustand store,
    now a factory function using `zustand/vanilla` `createStore`. Accepts a
    `PlatformAdapter`; zero imports from `@tauri-apps/*` or React.
  - Exported types: `AppState`, `CoreStore`, `Draft`, `Phase`, `SaveState`, `View`,
    `PortInUseError`, `DEFAULT_LOCAL_PORT`, `generateToken`.

- **`packages/ui/`** — reusable React components consumed by all client apps.
  - `context.ts`: `CoreProvider` (React context for the zustand store),
    `PlatformUIProvider` (file picker, URL opener, testConnection, killPort,
    defaultDeviceName), `useApp` hook (same API as zustand's `create()` return
    including `.getState()` and `.setState()`), `getClient()` / `getAppState()`
    for imperative non-React access, `registerCore()` for TipTap extensions.
  - All 30+ React components relocated from `apps/desktop/src/components/`:
    editor (RichEditor, LatexEditor, MarkdownEditor, Toolbar, ModeSwitcher,
    MathDialog, InlineMathPopover, MathNode, ImageNode, imageInsert, AutoPair,
    MathShortcuts), settings tabs (Profile, Account, Users, Server, Advanced,
    Connections, AddConnectionDialog, Billing), layout (MainLayout, Sidebar,
    EditorPane, MetaPane, SetupPage, SignedOutLanding, ServerSwitcher,
    MessagesPanel, ShareModal, HistoryModal, FolderPicker, SettingsPage), icons.
  - Platform-specific operations (file picker in `imageInsert.ts`, testConnection
    in SetupPage/AddConnectionDialog, killPort in SetupPage) now go through
    `PlatformUI` context — no Tauri imports in the shared layer.
  - `SetupPage` conditionally hides the "one-click local server" section when
    `hasLocalServer` is false (i.e. on mobile).

- **`apps/mobile/`** — Tauri 2 Android client.
  - `platform.ts`: mobile `PlatformAdapter` — `@tauri-apps/plugin-store` for KV,
    native `fetch` for HTTP (no Rust proxy needed on Android), no `localServer`.
  - `shell.ts`: `createAppStore(mobilePlatform)`, `registerCore()`,
    `mobilePlatformUI` with `tauri-plugin-opener` for external URLs.
  - `App.tsx` / `main.tsx`: same structure as desktop, wraps shared components
    with `CoreProvider` + `PlatformUIProvider`.
  - `styles.css`: imports the desktop stylesheet then overrides layout for mobile
    (single-column, slide-out sidebar, bottom-sheet meta pane, wider touch
    targets, horizontal-scroll toolbar).
  - Tauri shell: `tauri-plugin-store` + `tauri-plugin-opener` (no dialog, no
    local server, no reqwest).

- **Linux desktop support** — same `apps/desktop/` builds on Ubuntu LTS:
  - `tauri.conf.json`: bundle resource glob `binaries/omnilog-server*`.
  - `local_server.rs`: `SERVER_BIN` const is `omnilog-server.exe` on Windows,
    `omnilog-server` on Linux (`#[cfg(windows)]` / `#[cfg(not(windows))]`).
  - `prepare-server.mjs`: copies the platform-appropriate binary name.

### Changed

- **`apps/desktop/`** is now a thin Tauri shell (~10 source files):
  - `platform.ts`: assembles a `PlatformAdapter` from Tauri invoke + plugin-store.
  - `shell.ts`: creates the core store + `PlatformUI` (file picker via Tauri
    dialog, `read_file_bytes` invoke, rustFetch-backed testConnection).
  - `App.tsx`: wraps `@omnilog/ui` components with `CoreProvider` +
    `PlatformUIProvider`.
  - `store/appStore.ts`, `lib/drafts.ts`, `lib/config.ts`, `lib/theme.ts`:
    backward-compat re-export shims.
  - `lib/api.ts`: kept `rustFetch` (Tauri invoke → Rust reqwest) + `testConnection`.
  - `lib/localServer.ts`: kept `killPort`, `defaultDeviceName`, re-exports
    `PortInUseError` / `DEFAULT_LOCAL_PORT` from core.
  - `lib/store.ts`: deleted (absorbed into `platform.ts`).
  - `src/components/`, `src/assets/icons/`: deleted (now in `packages/ui/src/`).

- **`pnpm-workspace.yaml`**: added `packages/core`, `packages/ui`, `apps/mobile`.
- **Root `package.json`**: added `dev:mobile`, `build:mobile`, `tauri:mobile`
  scripts; `typecheck` now runs `pnpm -r --parallel typecheck`.
- **README**: updated repo layout, added build instructions for each target.

### Notes

- The three client apps share ≥80% of the TypeScript code. `packages/core` +
  `packages/ui` contain all business logic and React components; the host apps
  are <10 files each (platform adapter + context wiring + entry point).
- `packages/shared`, `packages/core`, and `packages/ui` are consumed as
  TypeScript source via Vite aliases + tsconfig paths — no build step for the
  shared packages during development. This is the same pattern the codebase
  already used for `@omnilog/shared`.
- Pre-existing type errors in `BillingTab.tsx` (the `License` type in
  `packages/shared/src/types.ts` doesn't include `status` / `currentPeriodEnd`
  fields that the server's License model has) are unchanged. These need the
  shared `License` type to be extended, but that's a separate fix.
- `apps/server/` is untouched — no server-side changes in this round.
- Mobile CSS imports the full desktop stylesheet then overrides layout.
  A future pass could extract shared CSS variables into `packages/ui/` and
  keep only layout-specific styles in each app.
- The Android WebView uses native `fetch` rather than the Rust reqwest proxy
  the desktop uses. Tauri 2's Android transport handles this correctly. If
  CORS issues surface with self-hosted servers, adding the Rust proxy to
  the mobile Tauri shell is a one-file change.

---

## 2026-06-04 — Repository initialised + first commit

### Added
- `.gitattributes` locking text files to LF on disk regardless of the
  contributor's OS — Windows checkouts can still use CRLF in the working
  tree via `core.autocrlf`.

### Changed
- `.gitignore`: added `installers/` and `portable/` (~50 MB of build
  artifacts — these belong in GitHub Releases, not source tree).
- Deleted the duplicate, out-of-date `apps/server/.env.example` — the root
  `.env.example` is canonical and now includes the Stripe block.
- README brought up to date: opening blurb reflects multi-mode editor,
  multi-server connections and the optional billing layer; env-vars list
  includes the Stripe block; the MVP checklist is replaced with a current
  Feature checklist split by editor / workspace / identity / connections /
  server. Points readers at LOG.md for the engineering journal.

### Notes
- `git init` performed at the repo root using the existing global git identity.
- 164 files in the initial commit — `node_modules/`, `target/`,
  `server_data/`, `installers/`, `portable/`, and every `.env*` (except
  `.env.example`) are excluded by `.gitignore`.
- No secrets in the staged files: the only `password = "..."` matches are
  the documented `admin` default in `config.rs` and React `useState("")`
  hooks.
- Repo is still **on Google Drive**. Drive's background sync occasionally
  races with git on `.git/index.lock`. If that ever surfaces, pause Drive
  → `git fsck` → re-resume; or move the working tree off Drive entirely
  (GitHub becomes the authoritative copy once we push).

---

## 2026-06-04 — Official server: Stripe billing end-to-end

### Added
- **Stripe wrapper** ([apps/server/src/billing/stripe.rs](apps/server/src/billing/stripe.rs)) — hand-rolled on `reqwest` + `hmac` (deliberately avoiding `async-stripe`'s huge types tree). Covers the four operations we need: create customer, create Checkout session, create Customer Portal session, fetch subscription. Plus `verify_webhook_signature` doing the HMAC-SHA256 over `<timestamp>.<raw body>` Stripe expects, with a ±5-minute replay window.
- **`License` model** ([apps/server/src/models/license.rs](apps/server/src/models/license.rs)) — one row per user, keyed on `_id = user_id`. Carries `plan` (free/pro/team), `status` (Stripe verbatim), `currentPeriodEnd`, `stripeCustomerId`, `subscriptionId`, derived `features`. `features_for_plan()` lives next to it.
- **Storage trait** gets `upsert_license`, `get_license`, `get_license_by_customer` (latter is for webhook routing by Stripe customer id). Implemented in both Json + Mongo; Mongo gets a `stripeCustomerId` index.
- **Routes** ([apps/server/src/routes/billing.rs](apps/server/src/routes/billing.rs)):
  - `GET /api/auth/license` — auth-required, returns the caller's License row (synthesises a free row if none stored). 404s on billing-disabled servers so the client falls through to the free experience.
  - `POST /api/billing/checkout` — auth-required, creates a Stripe Checkout session for `{plan: "pro" | "team"}`, returns the URL to open.
  - `POST /api/billing/portal` — auth-required, opens a Customer Portal session for cancel/change-plan/update-card.
  - `POST /api/billing/webhook` — public-but-signature-verified. Subscribes to `customer.subscription.created/updated/deleted` and `checkout.session.completed`; re-fetches the canonical subscription and writes back the License. Surfaces a notification in the user's inbox on every state change.
- **Config** (`config.rs`): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_TEAM`, `BILLING_RETURN_URL`. New helpers `billing_enabled()` + `stripe_price_for(plan)`. `.env.example` updated with the full block + commentary.
- **Cargo.toml**: `reqwest` (rustls-tls, json, no default features), `hmac`, `urlencoding`.
- **Bootstrap admin** (`main.rs`) now creates the initial user as `role: "owner"` (was `"admin"`) so password login + API_TOKEN auth give matching powers.
- **Frontend `BillingTab`** ([apps/desktop/src/components/settings/BillingTab.tsx](apps/desktop/src/components/settings/BillingTab.tsx)) — only mounted when the active connection is `kind === "official"`. Shows current plan + status + period end + features; three plan cards (Free, Pro, Team) with Subscribe / Change buttons that call `startCheckout` and open the returned URL in the OS browser (`window.open(_, "_blank")` — Tauri shells external links to the default browser). "Manage subscription" calls `openCustomerPortal`.
- **API client**: `startCheckout(plan)`, `openCustomerPortal()`, `API_ROUTES.billingCheckout` / `.billingPortal`.

### Changed
- Bootstrap admin role: `"admin"` → `"owner"` to match the static-token principal's hardcoded "owner" in `auth.rs`.

### Notes
- **Self-hosted instances are not affected.** `STRIPE_SECRET_KEY` empty ⇒ `billing_enabled()` false ⇒ every `/api/billing/*` and `/api/auth/license` 404 ⇒ client treats this as "no license info" (already wired in the previous session).
- **Wiring it up on the official deployment, in env terms:**
  - `STRIPE_SECRET_KEY=sk_live_...` (or `sk_test_...`)
  - `STRIPE_WEBHOOK_SECRET=whsec_...` from the Webhook endpoint registered at `https://<host>/api/billing/webhook`
  - `STRIPE_PRICE_PRO=price_...` and `STRIPE_PRICE_TEAM=price_...` for the products
  - `BILLING_RETURN_URL=https://app.omnilog.example.com` (where Stripe redirects after Checkout — both success and cancel bounce here)
- **Webhook signature** is HMAC-SHA256 over `"<timestamp>.<raw bytes>"` against `STRIPE_WEBHOOK_SECRET`. The handler takes `Bytes` (NOT `Json`) so the body isn't mutated by Axum's JSON extractor — Stripe signs the exact bytes received.
- The bootstrap principal (DEFAULT_USER_ID) can NOT subscribe — they're the operator, not a tenant. `/api/billing/checkout` rejects them with a clear 400. `GET /api/auth/license` for them returns an implicit free license without persisting a row.
- Free tier is implicit: anyone with no license row gets `default_free()`. We only persist a row once Stripe customer creation succeeds.
- The webhook acks `200 {"received": true}` to every event so Stripe doesn't retry — even for events we ignore (`invoice.paid`, `customer.created`, etc.).
- BillingTab is only visible when the active connection's `kind === "official"`. Self-hosted users never see it; admins on official deployments do see it (they can still subscribe individually).
- No `cargo build` / `pnpm typecheck` this session — battery saving per standing instruction. Things worth verifying on next plug-in: webhook signature against a real Stripe CLI replay, checkout-flow round-trip with a test card.

---

## 2026-06-04 — Multi-connection client + official-server scaffolding

### Added
- **`ServerConnection` + `License` types** ([packages/shared/src/types.ts](packages/shared/src/types.ts)) — a connection is `{ id, name, kind: "local-embedded" | "self-hosted" | "official", serverUrl, apiToken, deviceName, managedLocal?, lastConnectedAt?, license? }`. `License` carries `plan: "free" | "pro" | "team"`, optional `expiresAt`, `subscriptionId`, `features` — reserved for when the hosted service ships.
- **Connections list in storage** ([lib/config.ts](apps/desktop/src/lib/config.ts)) — `loadConnections()` / `saveConnections()` keep a `Record<id, ServerConnection>` plus the `activeConnectionId`. Legacy single `serverConfig` key is auto-migrated on first read.
- **appStore actions** — `addConnection`, `renameConnection`, `removeConnection`, `switchConnection`, plus a `connections` array + `activeConnectionId`. `config` is still exposed but is now a derived view of the active connection. `signOut` now detaches from the active connection while **keeping** the saved row (so the user can re-connect later); `resetConfig` is the nuclear wipe.
- **Topbar server switcher** ([ServerSwitcher.tsx](apps/desktop/src/components/ServerSwitcher.tsx)) — chip showing the active connection name + kind + online dot. Click drops a menu listing all saved servers and a "Manage connections…" deep-link to the new settings tab.
- **Settings → Connections tab** ([settings/ConnectionsTab.tsx](apps/desktop/src/components/settings/ConnectionsTab.tsx)) — list, set active, rename, remove, plus "+ Add server" → `AddConnectionDialog`.
- **AddConnectionDialog** — in-app modal for adding a self-hosted server (URL + API token *or* username/password) without going through the first-run SetupPage. Official server option is present but gated as "Coming soon".
- **SignedOutLanding** ([SignedOutLanding.tsx](apps/desktop/src/components/SignedOutLanding.tsx)) — replaces the bare SetupPage when the user has signed out but still has saved connections. Pick one to reconnect, remove, or add a new one.
- **License fetch on `loadMe`** — for `official` connections only, the client tries `GET /api/auth/license` and stores the result on the connection record. Self-hosted servers 404 (no endpoint yet) — silently ignored. Display: a small plan badge (`free` / `pro` / `team`) in the Connections tab.
- **API client**: `ApiClient.getLicense()` and `API_ROUTES.license`.

### Changed
- `init()`, `completeSetup()`, `signOut()`, `resetConfig()` rewritten around the connections list. `completeSetup()` now routes through `addConnection({activate: true})`.
- `App.tsx` picks the signed-out landing based on whether any connection is saved: empty → `SetupPage` (first-run), non-empty → `SignedOutLanding`.
- `loadServerConfig`, `saveServerConfig`, `isConfigUsable` in [lib/config.ts](apps/desktop/src/lib/config.ts) are marked `@deprecated` shims kept as a transitional surface — they read/write the active connection via the new APIs.
- Topbar gets a `topbar-left` wrapper so the brand and switcher sit together on the left, settings/messages/avatar remain on the right.

### Notes
- One client can only manage **one** local server at a time (port + bundled binary). `quickStartLocalServer` deduplicates by `(serverUrl, kind)` so re-running it overwrites the existing local entry instead of creating a duplicate.
- Switching connections wipes the editor's in-memory state (entries, current draft, folders, messages, me) — they belong to the previous server. Dirty local drafts are still kept by the drafts cache keyed on entry id; if you switch back to the originating server they'll show up dirty again.
- The official-server connection is reserved but **disabled at the UI level** (Coming soon). All the data plumbing is ready: the moment the hosted service ships, drop the disable and `getLicense()` will start returning a plan.
- README continues to be out of date — the connections list and multi-server flow aren't documented there yet.
- No `cargo build` / `pnpm typecheck` run this session — battery saving.

---

## 2026-06-04 — Settings as a page + `owner` role + profile + advanced tab

### Added
- **`owner` role** above `admin` in the role hierarchy (`owner > admin > user`). The bootstrap principal (API_TOKEN authentication) now reports as `owner` instead of `admin`. `AuthUser::is_owner()` helper; `users.rs` enforces a rank check on every edit (caller must outrank the target unless editing self; promoting to admin/owner requires owner).
- **User profile fields** — `display_name` and `avatar_data_url` on `User` / `PublicUser`. Avatar stored as a `data:image/...` URL, capped at 256 KB. New `PATCH /api/auth/me` for self-service edits. Bootstrap principal is rejected with a clear 400 (no stored row to update).
- **Owner-only `/api/admin/server-info` (GET + PATCH)** — returns build version, host, port, data_dir, embedded-vs-Mongo flag, database name, masked Mongo URI, env-bound CORS, runtime CORS override, public-URL note, total user count, and whether the call came from the static token. PATCH accepts `corsOrigin` + `publicUrl` overrides stored in the settings collection.
- **`SettingsPage`** ([`SettingsPage.tsx`](apps/desktop/src/components/SettingsPage.tsx)) — full-screen replacement for the old `SettingsModal`. Left tab list, right content pane. Tabs: **Profile**, **Account**, **Users** (admin/owner), **Server**, **Advanced** (owner only). Esc returns to editor.
- **`ProfileTab`** — display-name + avatar upload. File picker → reads as data URL → preview before save. Includes a shared `AvatarFrame` component (image or coloured initial fallback) reused by topbar / Users tab.
- **`AccountTab`** — change password + Sign-out (moved out of the gear modal).
- **`UsersTab`** — list + create + edit role + edit display name + reset password + delete. Honors the role hierarchy (rank-equal targets are non-editable; admin/owner options disabled when caller isn't owner).
- **`ServerTab`** — version-history toggle + connection info.
- **`AdvancedTab`** — owner-only. Renders the server-info dashboard plus editable CORS allowlist and public-URL note. Yellow alert when the save reports `restartRequired`.
- **Topbar avatar button** in `MainLayout` opens the settings page (replaces the gear icon).
- appStore: `view` state (`editor | settings`), `openSettings` / `closeSettings`, `updateProfile`.

### Changed
- `SettingsModal.tsx` deleted; all consumers point at `SettingsPage`.
- `MainLayout` no longer renders any settings modal; just calls `openSettings()` from the topbar.
- API client: `me`, `createUser`, `updateUser` now take/return `Role` (the new union) and the profile fields. New: `updateMe`, `getServerInfo`, `updateServerInfo`.
- `auth::authenticate` issues `role = "owner"` for the API_TOKEN principal (was `"admin"`).
- Users.list endpoint still returns everyone; bootstrap principal has no stored row so it never appears.

### Notes
- **Avatars are inlined into every user response.** Fine for personal-scale (cap is 256 KB) but the `users.list` / share-modal payloads grow linearly. If the deployment ever hits dozens of users, swap to a dedicated `GET /api/users/:id/avatar` endpoint serving the bytes.
- **CORS override is stored but not live-applied** — the CORS layer is built at server startup. PATCH returns `restartRequired: true` so the UI can warn the operator.
- **`MONGODB_URI`, `MONGODB_DB`, `PORT`, `HOST`, `DATA_DIR` are read-only in the UI**, by design — changing them at runtime would mean dropping in-flight Mongo connections and revalidating the data dir, which we'd rather not do behind a button. Owner sees the current values and is expected to edit the `.env` + restart.
- Old user rows from before this session don't have `role` matching the new enum — they'll still deserialize because `role` is just `String` server-side. They'll show in the UI as whatever their old role string was. If you had `"admin"` users, they remain admins. The bootstrap is the only `owner` until you promote someone.
- No `cargo build` / `pnpm typecheck` run this session — battery save. Worth manually verifying on next plug-in: the role-rank guard on PATCH /users/:id, avatar round-trip, and the Advanced tab's CORS override.

## 2026-06-04 — Folder UX + multi-mode editor + inline math popover

### Added
- **Editor modes** — Entry has a new `mode` field (`"rich" | "latex" | "markdown"`, default `"rich"`). Mirrored across `Entry`, `Version`, `CreateEntryInput`, `UpdateEntryInput` server-side; `WorklogEntry`, `EntryVersion`, `entryModeSchema`, `Draft` client-side.
- **Pure LaTeX editor** ([`LatexEditor.tsx`](apps/desktop/src/components/editor/LatexEditor.tsx)) — textarea + live KaTeX preview. Splits paragraphs on blank lines; `$…$` inline, `$$…$$` block. Tab inserts two spaces.
- **Pure Markdown editor** ([`MarkdownEditor.tsx`](apps/desktop/src/components/editor/MarkdownEditor.tsx)) — textarea + live HTML preview. Self-contained minimal parser (no new deps) handling headings, lists, blockquotes, fenced code, HR, bold/italic/strike/inline-code, links, images, plus inline `$…$` / block `$$…$$` math.
- **Inline math popover** ([`InlineMathPopover.tsx`](apps/desktop/src/components/editor/InlineMathPopover.tsx)) — small floating editor anchored under the inline math node; live KaTeX preview; Enter commits, Esc cancels, click-outside saves. Freshly-inserted empty nodes are removed on cancel.
- **Mode switcher** ([`ModeSwitcher.tsx`](apps/desktop/src/components/editor/ModeSwitcher.tsx)) — segmented Rich / Markdown / LaTeX control at the top of the editor pane.
- **Folder rename / move UI** — Sidebar shows ✎ / ↕ / × buttons on each owned folder row, and on the breadcrumb for the current folder. Entry rows hover-reveal a "move to" button.
- **`FolderPicker.tsx`** — modal indented-tree folder selector. Auto-excludes the moved folder + its descendants to prevent cycles. Used by both folder-move and entry-move flows.
- **MetaPane Folder section** — shows the current folder name and a "Move…" button so the user can re-file an open entry without leaving the editor.
- **appStore actions** — `renameFolder`, `moveFolder`, `moveEntry`, `setMode`.

### Changed
- **`EditorPane.tsx` refactored** — now just title input + mode switcher + dispatch. Rich-text logic moved into [`RichEditor.tsx`](apps/desktop/src/components/editor/RichEditor.tsx) so `useEditor` is only called when rich mode is mounted.
- **Block vs inline math routing** — block formulas (incl. `$$` shortcut) go to `MathDialog`; inline formulas go to the new `InlineMathPopover`. `MathDialog` kept for blocks because of the template buttons + larger area.
- **Version snapshot** — `Version` now carries `mode`, so restoring an older snapshot also restores the editor mode it was authored in.
- **Folder list endpoint** — already returned `FolderView` since the morning session; this afternoon's UI now uses `myRole` to gate the rename/move/share buttons.

### Notes
- Switching from rich to a source mode prompts a confirm because rich JSON gets wiped (source modes own `contentText`).
- Latex/Markdown editors still write a single-paragraph `contentJson` wrap so server-side search/export keep working.
- `MarkdownEditor` placeholder uses Private-Use-Area chars (U+E000/E001) to keep inline code/math from being re-parsed by the formatting pass.
- No `cargo build` / `pnpm typecheck` run this session — user is on battery, will verify next time plugged in. Anything that needs verification: source-mode editors round-tripping, popover anchoring math under the right node.

---

## 2026-06-04 — Multi-user system + sharing + notifications inbox

### Added
- `POST /api/auth/change-password` — self-service password change. Bootstrap admin (API_TOKEN principal) is rejected with a hint to rotate `API_TOKEN` env var.
- `PATCH /api/users/:id` — admin: change role and/or reset password. Blocks self-demotion and edits to the bootstrap admin.
- `DELETE /api/users/:id` — admin only. Drops every share granted *to* the deleted user; the user's own folders/entries are kept.
- `PATCH /api/folders/:id/shares/:userId` — owner: change a share's role without removing it. New `update_share_role` on the storage trait (Json + Mongo).
- **Notifications system** — new `Message` model + `/api/messages*` routes (list / mark-read / mark-all-read / delete). Hooks enqueue messages on share add, share remove, role change, folder rename, folder delete, admin user-update, password change.
- **FolderView** — `GET /api/folders` augments each folder with `myRole` + (for shared folders) `ownerUsername` so the UI can label "shared with you" and gate owner-only actions.
- **Frontend**
  - `SettingsModal` — Change-password form, Sign-out button (renamed from "Disconnect / Reset"), admin Users panel (list / role-change / reset-password / delete / add).
  - `ShareModal` — role is an inline `<select>` that PATCHes on change; remove button uses trash icon.
  - `Sidebar` — shared folders show `folderShared` icon + `@username`; current folder shows "shared" badge and hides the Share button when caller isn't owner.
  - `MessagesPanel` — anchored under a bell icon in the topbar; unread badge; click-to-jump to the linked folder; mark all read / dismiss buttons. 60-second background poll while online.
  - `appStore` — `me`, `messages` state; actions `signOut`, `changePassword`, `loadMe`, `loadMessages`, `markMessageRead`, `markAllMessagesRead`, `deleteMessage` (all optimistic).
  - New icons: `bell`, `users`, `key`, `logout`, `trash`, `folderShared`.

### Changed
- Auth boundary unchanged: static `API_TOKEN` still maps to `DEFAULT_USER_ID = "local-user"` and works alongside JWT.
- `Share.create` now rejects sharing back to the folder owner (was a silent no-op).
- `folders.update` triggers `folder.renamed` notifications to every share recipient when the name changes.
- `folders.delete` notifies recipients with `folder.deleted` and revokes their shares before deleting the folder.

### Notes
- The Mongo `shares` collection still lacks a unique index on `(folderId, userId)` — duplicates are possible if `add_share` is called twice for the same pair. Pre-existing; left alone this session.
- Shared folders whose parent isn't shared with the recipient don't surface under any visible parent in the Sidebar tree. Pre-existing; surfaces more visibly now that shared folders are first-class.
- Repo still has **no `.git`**. Highest-priority cleanup. Working tree backed up only by Google Drive sync.
- README at repo root is now significantly out of date — claims single-token auth, no multi-user, no sharing, no notifications, no source-mode editors.
