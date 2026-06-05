# OmniLog Development Log

## 2026-06-05 — Mobile Client: Architecture & Foundation

### Goal
Build the Android mobile client sharing maximum code with desktop. The user's
requirement: data structures and operations must be **modular** so desktop and
mobile always stay in sync on feature updates.

### Architecture Decisions

**Framework**: Tauri 2 Mobile (Android). Same stack as desktop — React frontend,
Rust bridge. This gives us:
- Same `@omnilog/shared` types, API client, and Zod schemas
- Same Rust HTTP transport (`http_proxy.rs`)
- Same editor conversion logic
- Platform-specific UI only

**Shared module expansion** (`packages/shared/`):

| Module | Before | After |
|--------|--------|-------|
| `types.ts` | Core domain types | + Draft interface |
| `schemas.ts` | Zod validation | (unchanged) |
| `api.ts` | ApiClient + routes | (unchanged) |
| `drafts.ts` | — (desktop only) | Pure draft ops: entryToDraft, isLocalId, newLocalId |
| `sourceConvert.ts` | — (desktop only) | Doc-to-Markdown/LaTeX serializers (no TipTap dep) |
| `store.ts` | — | DraftStore interface for platform-agnostic persistence |

**What stays platform-specific**:
- `apps/desktop/lib/drafts.ts` → implements DraftStore via Tauri Store plugin
- `apps/mobile/lib/drafts.ts` → implements DraftStore via AsyncStorage / SQLite
- UI components (desktop: multi-pane, mobile: single-pane with navigation)
- Local server spawning (desktop only)

### Mobile UI Plan
Single-pane navigation:
1. **Entry list** — swipeable, search bar, folder filter
2. **Editor** — full-screen, mode switcher in toolbar
3. **Settings** — server connection, profile, theme

No embedded server for mobile — connects to remote server only.

### Steps
1. Extract shared logic from desktop → `packages/shared/`
2. Initialize Tauri mobile project (`apps/mobile/`)
3. Implement Rust HTTP bridge (adapt from desktop)
4. Build mobile store + persistence
5. Build mobile UI components
6. Test on Android emulator

### Progress

**Completed:**
- Extracted `drafts.ts` (DraftStore interface + pure ops) and `docSerialize.ts`
  (ProseMirror→Markdown/LaTeX) to `packages/shared/`
- Desktop rewritten to consume shared modules — existing call signatures preserved
- Tauri 2 mobile project scaffolded: `apps/mobile/`
  - Rust backend: `http_proxy.rs` (identical to desktop), Store plugin, capabilities
  - TypeScript lib layer: `store.ts`, `api.ts`, `config.ts` (no local-server),
    `drafts.ts`, `theme.ts` — all sharing the same `@omnilog/shared` modules
  - Zustand store (`appStore.ts`): simplified vs desktop (no local server, no
    rich↔source mode conversion, markdown-default for new entries)
  - UI components: `LoginPage`, `EntryList`, `EntryView`, `SettingsPage`
  - Mobile-optimized CSS with safe-area insets, touch targets, dark theme
- Both desktop and mobile typecheck clean, Vite builds succeed
- pnpm workspace updated to include `apps/mobile`

**Next:**
- Run `tauri android init` to generate the Android project files
- Test on Android emulator
- Add rich text editing (ProseMirror/TipTap) if feasible on mobile WebView
- Image upload support

### Server Deployment (completed today)
- OmniLog server deployed to `2year.cantonren.com:9528`
- MongoDB storage, systemd service, firewall opened
- API proxied via `dev.aqouyang.com/api/omnilog/*`
- Product page live at `dev.aqouyang.com/omnilog`
