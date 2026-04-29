"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icons";
import { NAV } from "./nav-config";

export function Sidebar({ user }: { user: { name: string; role?: string } | null }) {
  const path = usePathname();
  const initials = (user?.name ?? "?").split(" ").map(s => s[0]).join("").slice(0, 2).toUpperCase();

  return (
    <aside className="sticky top-0 flex h-screen w-56 flex-col overflow-hidden border-r border-[var(--color-line)] bg-[var(--color-surface)]">
      <div className="flex items-center gap-2.5 border-b border-[var(--color-line-soft)] px-4 py-3">
        <div className="grid h-7 w-7 place-items-center rounded-md bg-[var(--color-accent)] text-xs font-bold text-white">B</div>
        <div>
          <div className="text-[13.5px] font-semibold leading-tight">BOM Studio</div>
          <div className="text-[11px] text-[var(--color-text-3)]">Halcyon Robotics</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {NAV.map(g => (
          <div key={g.group} className="px-2 py-2">
            <div className="px-2.5 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[var(--color-text-4)]">
              {g.group}
            </div>
            {g.items.map(it => {
              const active = path === it.href || path.startsWith(`${it.href}/`);
              const I = Icon[it.icon];
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  className={`relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${
                    active
                      ? "bg-[var(--color-surface-2)] font-medium text-[var(--color-text)]"
                      : "text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
                  }`}
                >
                  {active && <span className="absolute -left-2 top-1.5 bottom-1.5 w-0.5 rounded-r bg-[var(--color-accent)]" />}
                  <I size={16} className="opacity-85" />
                  <span>{it.label}</span>
                  {it.badge && (
                    <span className="ml-auto rounded-full bg-[var(--color-surface-3)] px-1.5 text-[10.5px] font-medium tabular-nums text-[var(--color-text-2)]">
                      {it.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="flex items-center gap-2.5 border-t border-[var(--color-line-soft)] p-3">
        <div className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#6f78ec] to-[var(--color-accent)] text-[11.5px] font-semibold text-white">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] leading-tight">{user?.name ?? "Anonymous"}</div>
          <div className="text-[11px] text-[var(--color-text-3)]">{user?.role ?? ""}</div>
        </div>
        <button className="grid h-7 w-7 place-items-center rounded-md text-[var(--color-text-3)] hover:bg-[var(--color-surface-2)]">
          <Icon.Settings size={14} />
        </button>
      </div>
    </aside>
  );
}
