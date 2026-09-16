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
    <aside className="sidebar">
      {/* Brand */}
      <div className="sb-brand">
        <div className="sb-logo">B</div>
        <div>
          <div className="sb-name">BOM Studio</div>
          <div className="sb-name-sub">Halcyon Robotics</div>
        </div>
      </div>

      {/* Nav */}
      <div className="flex-1 overflow-y-auto">
        {NAV.map((g) => {
          const visibleItems = g.items.filter((it) => !it.roles || it.roles.includes(role));
          if (visibleItems.length === 0) return null;
          return (
            <div className="sb-section" key={g.group}>
              <div className="sb-section-label">{g.group}</div>
              {visibleItems.map((it) => {
                const active = path === it.href || path.startsWith(`${it.href}/`);
                const I = Icon[it.icon];
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    aria-current={active ? "page" : undefined}
                    className={`sb-item ${active ? "active" : ""}`}
                  >
                    <I className="ico" />
                    <span>{it.label}</span>
                    {it.badge && <span className="badge">{it.badge}</span>}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* User menu */}
      <UserMenu user={user} />
    </aside>
  );
}
