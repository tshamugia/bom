import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTheme, readThemeMode, resolveTheme, setThemeMode, subscribeTheme, THEME_META_COLOR } from "@/lib/theme";

function mockSystemDark(dark: boolean) {
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: dark && query.includes("dark"),
    media: query,
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
  }));
  return {
    flip(next: boolean) {
      dark = next;
      listeners.forEach(cb => cb());
    },
  };
}

describe("theme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    document.documentElement.style.colorScheme = "";
    document.head.innerHTML = '<meta name="theme-color" content="#ffffff">';
  });
  afterEach(() => vi.unstubAllGlobals());

  it("defaults to light when nothing (or junk) is saved", () => {
    expect(readThemeMode()).toBe("light");
    localStorage.setItem("theme", "sepia");
    expect(readThemeMode()).toBe("light");
  });

  it("resolves system from the OS preference", () => {
    mockSystemDark(true);
    expect(resolveTheme("system")).toBe("dark");
    mockSystemDark(false);
    expect(resolveTheme("system")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
  });

  it("puts the dark class, color-scheme and status-bar color on the page", () => {
    mockSystemDark(false);
    applyTheme("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe(THEME_META_COLOR.dark);
    applyTheme("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe(THEME_META_COLOR.light);
  });

  it("saves the choice and tells subscribers", () => {
    mockSystemDark(false);
    const seen = vi.fn();
    const off = subscribeTheme(seen);
    setThemeMode("dark");
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(seen).toHaveBeenCalledTimes(1);
    off();
    setThemeMode("light");
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("follows the OS while on system, and ignores it otherwise", () => {
    const os = mockSystemDark(false);
    const seen = vi.fn();
    const off = subscribeTheme(seen);
    setThemeMode("system");
    seen.mockClear();
    os.flip(true);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(seen).toHaveBeenCalledTimes(1);

    setThemeMode("light");
    seen.mockClear();
    os.flip(false);
    os.flip(true);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(seen).not.toHaveBeenCalled();
    off();
  });
});
