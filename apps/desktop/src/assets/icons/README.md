# UI icons (vector / "text" icons)

This folder holds the in-app vector icons used by the editor toolbar and other
controls. They are inline SVGs, so they scale crisply and follow the current
text color (light/dark mode) automatically.

## Where things go

- **Toolbar / UI icons (here):** `apps/desktop/src/assets/icons/`
  - Edit `index.tsx` to add, change, or replace an icon.
  - Each icon is a 24x24 `viewBox`, stroke-based path using `currentColor`.
  - You can also drop `.svg` files in this folder and import them, e.g.
    `import myIcon from "./my-icon.svg";` then use `<img src={myIcon} />`,
    or paste the path data into `index.tsx`.

- **Application logo / window & installer icon (image icon):**
  `apps/desktop/src-tauri/icons/`
  - Replace the whole set from a single source image (1024x1024 PNG recommended):
    ```bash
    pnpm --filter @omnilog/desktop tauri icon path/to/logo.png
    ```
  - That regenerates `32x32.png`, `128x128.png`, `icon.ico`, `icon.png`, etc.

## Adding a toolbar icon

1. Add a name to `IconName` and an entry to `ICONS` in `index.tsx`.
2. Use it: `<Icon name="yourName" />`.
