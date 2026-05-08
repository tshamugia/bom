"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Icon } from "@/components/icons";

type Mode = "light" | "dark" | "system";

const STORAGE_KEY = "theme";

function applyMode(mode: Mode) {
  const resolved =
    mode === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : mode;
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getSnapshot(): Mode {
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "light" || v === "dark" || v === "system" ? v : "system";
}

const getServerSnapshot = (): Mode => "system";

export function ThemeToggle() {
  const mode = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyMode("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);

  function pick(next: Mode) {
    window.localStorage.setItem(STORAGE_KEY, next);
    applyMode(next);
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
  }

  const options: { value: Mode; label: string; icon: keyof typeof Icon }[] = [
    { value: "light", label: "Light", icon: "Sun" },
    { value: "dark", label: "Dark", icon: "Moon" },
    { value: "system", label: "System", icon: "Monitor" },
  ];

  return (
    <div className="px-1 py-1">
      <div className="px-1.5 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-[var(--color-text-3)]">
        Theme
      </div>
      <div className="grid grid-cols-3 gap-1">
        {options.map((o) => {
          const I = Icon[o.icon];
          const active = mode === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => pick(o.value)}
              className={`flex flex-col items-center gap-1 rounded-md px-2 py-1.5 text-[11px] transition-colors ${
                active
                  ? "bg-[var(--color-side-active-bg)] text-[var(--color-side-active)]"
                  : "text-[var(--color-side-text-2)] hover:bg-[var(--color-side-hover-bg)] hover:text-[var(--color-side-active)]"
              }`}
            >
              <I size={14} />
              <span>{o.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
