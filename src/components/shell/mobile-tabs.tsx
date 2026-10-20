"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icons";
import type { UserRole } from "@/lib/roles";
import { MOBILE_TABS, VIEWER_MOBILE_TABS } from "./nav-config";

/**
 * Bottom tab bar on phones (hidden from 701px); "More" opens the sidebar drawer.
 * What needs the user is counted on the top bar's bell, not here.
 */
export function MobileTabs({
  onMore,
  navOpen,
  role,
}: {
  onMore: () => void;
  navOpen: boolean;
  role: UserRole;
}) {
  const path = usePathname();
  const tabs = role === "viewer" ? VIEWER_MOBILE_TABS : MOBILE_TABS;

  return (
    <nav className="m-tabs" aria-label="Quick navigation">
      {tabs.map(t => {
        const active = !navOpen && (path === t.href || path.startsWith(`${t.href}/`));
        const I = Icon[t.icon];
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`m-tab ${active ? "active" : ""}`}
          >
            <span className="m-tab-ico"><I className="ico" /></span>
            <span>{t.label}</span>
          </Link>
        );
      })}
      <button
        type="button"
        className={`m-tab ${navOpen ? "active" : ""}`}
        aria-label="More navigation"
        aria-expanded={navOpen}
        onClick={onMore}
      >
        <span className="m-tab-ico"><Icon.More className="ico" /></span>
        <span>More</span>
      </button>
    </nav>
  );
}
