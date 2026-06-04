# Application icon (image icon)

This folder holds the OmniLog application image icon used for the window, the
taskbar, and the Windows installers (`.ico` / `.png` in several sizes).

The current files are placeholders (a solid blue square). To use your own logo:

```bash
# from the repo root; source should be a square PNG, ideally 1024x1024
pnpm --filter @omnilog/desktop tauri icon path/to/logo.png
```

This regenerates every size referenced by `tauri.conf.json`:
`32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.png`, `icon.ico`.

After replacing, rebuild the app (`pnpm --filter @omnilog/desktop tauri build`)
for the new icon to appear in the installer and window.

> In-app toolbar / UI icons are separate and live in
> `apps/desktop/src/assets/icons/`.
