"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icons";
import type { UserRole } from "@/lib/roles";
import { MOBILE_TABS, VIEWER_MOBILE_TABS } from "./nav-config";

/**
 * Bottom tab bar on phones (hidden from 701px); "More" opens the sidebar drawer.
 * `badge` is shown on the first tab — the viewer's overview, where pending
 * receipts are confirmed.
 */
export function MobileTabs({
  onMore,
  navOpen,
  role,
  badge = 0,
}: {
  onMore: () => void;
  navOpen: boolean;
  role: UserRole;
  badge?: number;
}) {
  const path = usePathname();
  const tabs = role === "viewer" ? VIEWER_MOBILE_TABS : MOBILE_TABS;

  return (
    <nav className="m-tabs" aria-label="Quick navigation">
      {tabs.map((t, i) => {
        const active = !navOpen && (path === t.href || path.startsWith(`${t.href}/`));
        const I = Icon[t.icon];
        const count = i === 0 ? badge : 0;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`m-tab ${active ? "active" : ""}`}
          >
            <span className="m-tab-ico"><I className="ico" /></span>
            <span>{t.label}</span>
            {count > 0 && (
              <span className="m-tab-dot" aria-label={`${count} waiting for you`}>{count > 9 ? "9+" : count}</span>
            )}
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
