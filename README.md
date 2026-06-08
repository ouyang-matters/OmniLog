# OmniLog

**OmniLog is a self-hosted-first work-journal app.** You run your own server
and a desktop client connects to it over HTTP(S). The same binary powers both
self-hosted instances and the (future) official hosted service; billing is
unlocked by setting Stripe env vars, and everything else is identical.

- **Desktop client**: Tauri 2 + React + TypeScript. Three editor modes (TipTap
  rich text, Markdown source with live preview, LaTeX source with live KaTeX
  preview). Inline formula popover, KaTeX math everywhere, folder tree with
  drag-free move/rename, multi-server connection switcher in the topbar.
  Builds on **Windows** and **Linux** (Ubuntu LTS).
- **Mobile client**: Tauri 2 Android target. Same shared business logic and
  UI components as the desktop, with a mobile-tuned layout (single-column,
  slide-out sidebar, bottom-sheet meta pane, touch-friendly controls).
- **Server**: Rust + Axum + MongoDB (or embedded JSON storage for zero-deps
  deployments). Multi-user with `owner > admin > user` role hierarchy,
  per-folder sharing, version history with snapshot/restore, notifications
  inbox. Cross-platform across Windows, Linux, and Docker out of the box.
- **Official hosted service**: same binary, billing enabled when
  `STRIPE_SECRET_KEY` is set. Self-hosted instances leave it empty and every
  `/api/billing/*` route 404s, so the client falls through to the free
  experience automatically.

```
omnilog/
  apps/
    desktop/          # Tauri 2 desktop shell (Windows + Linux)
    mobile/           # Tauri 2 Android shell
    server/           # Rust + Axum server (optional Stripe billing)
  packages/
    shared/           # TypeScript types, zod schemas, API client
    core/             # Framework-agnostic business logic (zustand store,
                      # drafts engine, connection manager, theme). No Tauri
                      # or React imports; platform deps are injected via
                      # PlatformAdapter interface.
    ui/               # Reusable React components (editor, settings, layout).
                      # Consumed by desktop and mobile via CoreProvider +
                      # PlatformUIProvider contexts.
  .env.example
  LOG.md              # Engineering log: dated journal of every change
  README.md
```

### Building each target

```bash
pnpm install                              # once, from repo root

# Desktop (Windows or Linux)
pnpm --filter @omnilog/desktop tauri build

# Android
pnpm --filter @omnilog/mobile tauri android build

# Server
cargo build --release --manifest-path apps/server/Cargo.toml

# Type-check everything
pnpm typecheck
```

---

## 1. Prerequisites

| Tool | Version | Used by |
| --- | --- | --- |
| [Rust](https://rustup.rs) | 1.77+ (stable) | server + Tauri |
| [Node.js](https://nodejs.org) | 20+ | client + shared |
| [pnpm](https://pnpm.io) | 9+ | workspace manager |
| [MongoDB](https://www.mongodb.com/try/download/community) | 6+ | database |

**Windows only** - the desktop client additionally needs:

- **Microsoft Edge WebView2 Runtime** (preinstalled on Windows 11; otherwise
  [download here](https://developer.microsoft.com/microsoft-edge/webview2/)).
- **Microsoft C++ Build Tools** (the "Desktop development with C++" workload)
  for compiling the Tauri/Rust side.

Install JS dependencies once from the repo root:

```bash
pnpm install
```

---

## 2. MongoDB

The server reads its connection string from `MONGODB_URI`, so MongoDB can live
**anywhere** - on the same machine, another machine on your LAN, or MongoDB
Atlas. It does **not** have to be on the same box as the server.

### Run MongoDB locally

- **Windows** - install MongoDB Community Server; it registers a `MongoDB`
  Windows service that starts automatically. Verify:
  ```powershell
  Get-Service MongoDB
  ```
- **Linux** - install `mongodb-org` (or `mongodb`) and start it:
  ```bash
  sudo systemctl enable --now mongod
  ```
- **Docker** (any OS):
  ```bash
  docker run -d --name omnilog-mongo -p 27017:27017 mongo:7
  ```

Example connection strings:

```
mongodb://127.0.0.1:27017                 # local
mongodb://user:pass@192.168.1.50:27017    # another machine on the LAN
mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net   # Atlas
```

Default database name is `omnilog`. Collections (`users`, `entries`, `assets`,
`tags`, `settings`) are created on demand; indexes are created on startup.

---

## 3. The server (Rust + Axum)

### Configure

Copy the example env file and edit it:

```bash
# from the repo root
cp .env.example apps/server/.env       # Linux/macOS
copy .env.example apps\server\.env     # Windows (cmd)
Copy-Item .env.example apps\server\.env  # Windows (PowerShell)
```

```env
PORT=3000
HOST=0.0.0.0
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB=omnilog
DATA_DIR=./server_data
API_TOKEN=change-me        # static bearer token (also signs JWTs)
CORS_ORIGIN=*              # or a comma-separated allowlist
ADMIN_USERNAME=admin       # bootstrap owner created on first run
ADMIN_PASSWORD=admin

# Stripe (official deployment only; leave empty for self-hosted)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_PRO=
STRIPE_PRICE_TEAM=
BILLING_RETURN_URL=
```

> Authentication: the static `API_TOKEN` always authenticates as the server
> *owner*. Individual users sign in via `POST /api/auth/login` with their
> username/password and get a JWT (signed with `API_TOKEN`). Both work
> everywhere.

`DATA_DIR` holds everything the server writes - **cross-platform**, resolved
with `PathBuf`:

```
server_data/
  assets/images/   # uploaded images
  exports/         # generated exports
  logs/            # rolling daily logs
```

The default `./server_data` works the same on Windows and Linux (it is created
relative to the working directory). Set an absolute path if you prefer.

### Start it

**Windows - development**
```bash
cd apps/server
cargo run
```

**Windows - production**
```bash
cd apps/server
cargo build --release
./target/release/omnilog-server.exe
```

**Linux - development**
```bash
cd apps/server
cargo run
```

**Linux - production**
```bash
cd apps/server
cargo build --release
./target/release/omnilog-server
```

**Optional - PM2** (run the release binary as a managed service):
```bash
pm2 start ./target/release/omnilog-server --name omnilog-server
```

From the repo root you can also use the workspace scripts:
```bash
pnpm dev:server      # cargo run
pnpm build:server    # cargo build --release
```

### Verify

```bash
curl http://localhost:3000/health
# { "ok": true, "name": "OmniLog Server", "version": "0.1.0" }
```

---

## 4. The desktop client (Tauri)

### Run in development

```bash
pnpm --filter @omnilog/desktop tauri dev
# or:  cd apps/desktop && pnpm tauri:dev
```

On first launch the client opens the **server setup page**.

#### Option A - One-click local server (no setup)

Click **Start local server**. The client launches a bundled OmniLog server on
this machine using the built-in **embedded storage backend** (no MongoDB to
install), generates an API token, saves the default connection info
automatically, and drops you straight into the app. Data is stored per-user
under the OS app-data directory (`server_data/db`). The local server is stopped
when you quit, and re-started automatically next launch.

> The embedded backend is selected whenever `MONGODB_URI` is empty. To use
> MongoDB instead, configure a custom server (Option B) or run the server
> yourself with a real `MONGODB_URI`.

For development, build the bundled binary once so the feature works in
`tauri dev`:
```bash
pnpm --filter @omnilog/desktop prepare:server
```
(The production `tauri build` runs this automatically.)

#### Option B - Connect to an existing server

1. **Server Mode** - choose *Custom self-hosted server*. (*Official hosted
   server* is present but disabled - "Official hosted service is not available
   yet.")
2. **Server URL** - e.g. `http://localhost:3000` or `https://api.example.com`.
3. **API Token** - must match the server's `API_TOKEN`.
4. **Device Name** - optional label for this machine.
5. **Test Connection** - calls `GET /health` and reports the result.
6. **Save and Continue** - stores the config in Tauri's local settings (in the
   OS app-config directory - nothing is hard-coded) and enters the main UI.

You can re-open settings and **Reset Settings** at any time.

Startup logic:
- Valid saved config -> straight to the main UI.
- No config -> setup page.
- Config present but server unreachable -> the app still opens, works from the
  local cache, and shows an **Offline** pill with a retry button. It never
  white-screens or crashes, and unsaved edits are kept as local drafts that sync
  when the server returns.

### Package a Windows installer

```bash
# (optional) replace the placeholder icons with your own logo first:
pnpm --filter @omnilog/desktop tauri icon path/to/logo.png

pnpm --filter @omnilog/desktop tauri build
```

Output installers (`.msi` / `.exe`) are written to
`apps/desktop/src-tauri/target/release/bundle/`.

---

## 5. API reference (MVP)

All `/api/*` routes require `Authorization: Bearer <API_TOKEN>`. `/health` does
not.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Connectivity probe |
| GET | `/api/entries` | List entries (`?tag=` to filter) |
| POST | `/api/entries` | Create an entry |
| GET | `/api/entries/:id` | Fetch one entry |
| PATCH | `/api/entries/:id` | Update an entry (optimistic `baseVersion`) |
| DELETE | `/api/entries/:id` | Soft-delete an entry |
| POST | `/api/assets/image` | Upload an image (multipart) |
| GET | `/api/assets/:id` | Fetch image bytes |
| DELETE | `/api/assets/:id` | Delete an image |
| GET | `/api/search?q=` | Search title / body / tags |
| POST | `/api/export` | Export entries to `DATA_DIR/exports` |

The exact request/response shapes live in
[`packages/shared`](packages/shared/src) (`types.ts`, `schemas.ts`, `api.ts`) and
are shared by client and server.

---

## 6. Editor features

- Headings, paragraphs, **bold**, *italic*, underline, ~~strikethrough~~,
  inline code.
- Bullet / ordered / task lists, blockquotes, code blocks, dividers, tables.
- Undo / redo and Markdown-style shortcuts.
- Shortcuts: `Ctrl+B` `Ctrl+I` `Ctrl+U` bold/italic/underline, `Ctrl+K` link,
  `Ctrl+S` save now, `Ctrl+F` focus search.
- **Images** - paste, drag-and-drop, or pick a file; uploaded to the server and
  stored under `DATA_DIR/assets/images` with metadata in MongoDB. Resize,
  caption, replace, delete.
- **Math (KaTeX)** - inline and block formulas; click to re-edit the LaTeX;
  templates for fractions, sub/superscripts, integrals, sums, matrices. Invalid
  LaTeX is shown safely without crashing.
- Dark mode, IME-friendly Chinese input (composition is never interrupted),
  non-blocking debounced autosave.

---

## 7. Architecture notes

- The client **never** talks to MongoDB directly - only to the server over
  HTTP(S). Requests go through Tauri's HTTP plugin, so CORS and self-signed/LAN
  servers are not a problem.
- MVP auth is a single shared bearer token from `.env`. The document shape
  already carries `userId`, so multi-user JWT can be added later without a data
  migration.
- Storage is local (`DATA_DIR`) today; `storagePath` is kept abstract so an
  S3/R2 backend can be slotted in later.
- REST today; the schema and ids (UUID strings, `version`, `syncStatus`,
  `deviceId`, `contentHash`) are designed to support multi-device sync /
  WebSocket later.

---

## 8. Feature checklist

Beyond the original MVP, this version ships:

**Editor**
- [x] Three editor modes per entry: `rich` (TipTap), `markdown` (with live HTML
      preview), `latex` (with live KaTeX preview)
- [x] Inline math popover (click an inline formula → small editor anchored at
      the node), block math modal with templates
- [x] Smooth Chinese IME input (composition never interrupted)
- [x] Auto-pair brackets/quotes (CJK + ASCII), `$$` and `$…$` shortcuts
- [x] Paste / drag-and-drop images straight into the editor

**Workspace**
- [x] Folder tree with rename, move, delete, share
- [x] Per-folder sharing with roles (`viewer` / `editor` / `owner`)
- [x] "Shared with you" badge + owner attribution
- [x] Search across title / body / tags
- [x] Version history with snapshot + restore (mode-aware)
- [x] Local-first: dirty drafts survive offline; auto-flush on reconnect

**Identity & multi-user**
- [x] `owner > admin > user` role hierarchy, enforced server-side
- [x] Self profile (display name + avatar) + change password
- [x] Admin user management (list / role / reset password / delete)
- [x] Notifications inbox (share invites, role changes, billing, etc.)

**Connections**
- [x] Multi-server client: saved connection list, switcher in the topbar
- [x] One-click managed local server (no MongoDB required)
- [x] Self-hosted or official server connections; future paid plans are
      gated behind a `License` (free / pro / team) the official server
      issues via Stripe

**Server**
- [x] Two storage backends: MongoDB (default) and embedded JSON
- [x] Cross-platform (Windows + Linux); Tauri ships the embedded backend
- [x] Rolling daily log files under `DATA_DIR/logs`
- [x] Optional Stripe billing (Checkout + Customer Portal + signed webhook).
      Leave `STRIPE_SECRET_KEY` empty to disable billing entirely.

**See [LOG.md](LOG.md) for the dated engineering journal.**

---

## License

MIT
