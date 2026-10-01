"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoMark } from "@/components/brand/logo-mark";
import { Icon } from "@/components/icons";
import { BRAND_COMPANY, BRAND_NAME } from "@/lib/brand";
import { NAV } from "./nav-config";
import { UserMenu } from "./user-menu";
import type { UserRole } from "@/lib/roles";

export function Sidebar({
  user,
  pendingReceipts = 0,
  onNavigate,
}: {
  user: { name: string; email: string; role: UserRole } | null;
  pendingReceipts?: number;
  onNavigate?: () => void;
}) {
  const path = usePathname();
  const role = user?.role ?? "member";

  return (
    <aside className="sidebar">
      {/* Brand */}
      <div className="sb-brand">
        <LogoMark size={30} />
        <div>
          <div className="sb-name">{BRAND_NAME}</div>
          <div className="sb-name-sub">{BRAND_COMPANY}</div>
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
                // Viewers confirm receipts on their overview, so the count sits there.
                const badge = it.badge ?? (role === "viewer" && it.href === "/dashboard" && pendingReceipts > 0
                  ? String(pendingReceipts)
                  : undefined);
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    aria-current={active ? "page" : undefined}
                    className={`sb-item ${active ? "active" : ""}`}
                    onClick={onNavigate}
                  >
                    <I className="ico" />
                    <span>{role === "viewer" && it.viewerLabel ? it.viewerLabel : it.label}</span>
                    {badge && <span className="badge">{badge}</span>}
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
