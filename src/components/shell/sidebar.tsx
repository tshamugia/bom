"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icons";
import { NAV } from "./nav-config";
import { UserMenu } from "./user-menu";

export function Sidebar({ user }: { user: { name: string; email: string; role: "owner" | "admin" | "member" } | null }) {
  const path = usePathname();
  const role = user?.role ?? "member";

  return (
    <aside
      className="sticky top-0 flex h-screen w-56 flex-col overflow-hidden text-[var(--color-side-text)]"
      style={{
        background:
          "linear-gradient(180deg, var(--color-side-bg-2) 0%, var(--color-side-bg) 100%)",
        boxShadow: "var(--shadow-side)",
      }}
    >
      {/* Brand */}
      <div className="flex items-center gap-2.5 border-b border-[var(--color-side-line)] px-4 py-3.5">
        <div
          className="grid h-8 w-8 place-items-center rounded-lg text-[13px] font-bold text-white shadow-[0_2px_8px_rgba(79,70,229,0.45)]"
          style={{
            background:
              "linear-gradient(135deg, var(--color-cat-indigo) 0%, var(--color-cat-violet) 100%)",
          }}
        >
          B
        </div>
        <div className="min-w-0">
          <div className="truncate text-[14px] font-semibold leading-tight tracking-tight text-[var(--color-side-active)]">
            BOM Studio
          </div>
          <div className="truncate text-[11px] text-[var(--color-side-text-3)]">
            Halcyon Robotics
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {NAV.map((g) => {
          const visibleItems = g.items.filter(it => !it.roles || it.roles.includes(role));
          if (visibleItems.length === 0) return null;
          return (
          <div key={g.group} className="mb-3 last:mb-0">
            <div className="flex items-center gap-1.5 px-3 pb-1.5 pt-1">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: g.accent }}
                aria-hidden
              />
              <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--color-side-text-3)]">
                {g.group}
              </div>
            </div>
            {visibleItems.map((it) => {
              const active = path === it.href || path.startsWith(`${it.href}/`);
              const I = Icon[it.icon];
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  aria-current={active ? "page" : undefined}
                  className={`group relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] leading-none transition-colors ${
                    active
                      ? "bg-[var(--color-side-active-bg)] font-semibold text-[var(--color-side-active)]"
                      : "font-medium text-[var(--color-side-text-2)] hover:bg-[var(--color-side-hover-bg)] hover:text-[var(--color-side-active)]"
                  }`}
                >
                  {active && (
                    <span
                      className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r"
                      style={{ background: g.accent }}
                    />
                  )}
                  <I
                    size={16}
                    className="flex-shrink-0"
                    style={{
                      color: active ? g.accent : undefined,
                      opacity: active ? 1 : 0.85,
                    }}
                  />
                  <span className="truncate">{it.label}</span>
                  {it.badge && (
                    <span
                      className="ml-auto rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums text-white"
                      style={{ background: g.accent }}
                    >
                      {it.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
          );
        })}
      </nav>

      {/* User menu */}
      <div className="border-t border-[var(--color-side-line)] p-2.5">
        <UserMenu user={user} />
      </div>
    </aside>
  );
}
