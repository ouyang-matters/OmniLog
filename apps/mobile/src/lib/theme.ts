import { getStore } from "./store";

export type Theme = "light" | "dark";

const THEME_KEY = "theme";

export async function loadTheme(): Promise<Theme> {
  const store = await getStore();
  const t = await store.get<Theme>(THEME_KEY);
  if (t === "light" || t === "dark") return t;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export async function saveTheme(theme: Theme): Promise<void> {
  const store = await getStore();
  await store.set(THEME_KEY, theme);
  await store.save();
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}
