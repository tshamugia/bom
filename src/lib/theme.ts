/**
 * Light / dark / system theme. The choice lives in localStorage; the applied
 * theme is the `dark` class on <html> (globals.css swaps the palette on it).
 * The inline script in app/layout.tsx applies the same rules before first
 * paint — keep the two in step.
 */
export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "theme";
const CHANGE_EVENT = "bom:themechange";
/** Browser chrome (mobile status bar) matches the top bar's surface. */
export const THEME_META_COLOR: Record<ResolvedTheme, string> = { light: "#ffffff", dark: "#161a21" };

const systemQuery = () => window.matchMedia("(prefers-color-scheme: dark)");

export function readThemeMode(): ThemeMode {
  try {
    const v = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    // Storage blocked (private mode): fall through to the default.
  }
  return "light";
}

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === "system") return systemQuery().matches ? "dark" : "light";
  return mode;
}

export function applyTheme(mode: ThemeMode) {
  const resolved = resolveTheme(mode);
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_META_COLOR[resolved]);
}

export function setThemeMode(mode: ThemeMode) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Still apply it for this page view.
  }
  applyTheme(mode);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Calls onChange when the theme changes here, in another tab, or in the OS (on "system"). */
export function subscribeTheme(onChange: () => void) {
  // Another tab changed the setting.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== THEME_STORAGE_KEY) return;
    applyTheme(readThemeMode());
    onChange();
  };
  // The OS switched light/dark while the user is on "system".
  const mq = systemQuery();
  const onSystem = () => {
    if (readThemeMode() !== "system") return;
    applyTheme("system");
    onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  mq.addEventListener("change", onSystem);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
    mq.removeEventListener("change", onSystem);
  };
}

export const isDarkApplied = () => document.documentElement.classList.contains("dark");
