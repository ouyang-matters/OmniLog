import type { KVStore } from "./platform.js";

export type Theme = "light" | "dark";

const THEME_KEY = "theme";

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

export function createThemeManager(kvStoreP: Promise<KVStore>) {
  async function loadTheme(): Promise<Theme> {
    const store = await kvStoreP;
    const t = await store.get<Theme>(THEME_KEY);
    if (t === "light" || t === "dark") return t;
    return typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  async function saveTheme(theme: Theme): Promise<void> {
    const store = await kvStoreP;
    await store.set(THEME_KEY, theme);
    await store.save();
  }

  return { loadTheme, saveTheme };
}

export type ThemeManager = ReturnType<typeof createThemeManager>;
