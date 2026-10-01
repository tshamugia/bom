"use client";

import { useSyncExternalStore } from "react";
import { Icon } from "@/components/icons";
import {
  isDarkApplied, readThemeMode, setThemeMode, subscribeTheme, type ResolvedTheme, type ThemeMode,
} from "@/lib/theme";

/** The saved choice and the theme actually showing. Server render assumes light. */
export function useTheme(): { mode: ThemeMode; resolved: ResolvedTheme } {
  const mode = useSyncExternalStore(subscribeTheme, readThemeMode, () => "light" as const);
  const dark = useSyncExternalStore(subscribeTheme, isDarkApplied, () => false);
  return { mode, resolved: dark ? "dark" : "light" };
}

const OPTIONS: { value: ThemeMode; label: string; icon: "Sun" | "Moon" | "Monitor" }[] = [
  { value: "light", label: "Light", icon: "Sun" },
  { value: "dark", label: "Dark", icon: "Moon" },
  { value: "system", label: "System", icon: "Monitor" },
];

/** Light / Dark / System picker for the account menu. */
export function ThemeToggle() {
  const { mode } = useTheme();

  return (
    <div className="px-1.5 py-1.5">
      <div className="pb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
        Theme
      </div>
      <div
        role="radiogroup"
        aria-label="Theme"
        className="grid grid-cols-3 rounded-[var(--r-2)] border border-[var(--line)] bg-[var(--surface-2)] p-0.5"
      >
        {OPTIONS.map((o) => {
          const I = Icon[o.icon];
          const active = mode === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setThemeMode(o.value)}
              className={`flex items-center justify-center gap-1.5 rounded-[3px] px-2 py-1.5 text-[11.5px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
                active
                  ? "bg-[var(--surface)] text-foreground shadow-[var(--shadow-1)] ring-1 ring-[var(--line)]"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <I size={13} aria-hidden />
              <span>{o.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Top-bar shortcut: flips between light and dark (leaving "system" behind). */
export function ThemeButton() {
  const { resolved } = useTheme();
  const next = resolved === "dark" ? "light" : "dark";
  const I = resolved === "dark" ? Icon.Sun : Icon.Moon;
  return (
    <button
      type="button"
      className="btn btn-icon btn-ghost"
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      onClick={() => setThemeMode(next)}
    >
      <I className="ico" aria-hidden />
    </button>
  );
}
