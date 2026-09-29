"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icons";
import { MOBILE_TABS } from "./nav-config";

/** Bottom tab bar on phones (hidden above 700px); "More" opens the sidebar drawer. */
export function MobileTabs({ onMore, navOpen }: { onMore: () => void; navOpen: boolean }) {
  const path = usePathname();

  return (
    <nav className="m-tabs" aria-label="Quick navigation">
      {MOBILE_TABS.map((t) => {
        const active = path === t.href || path.startsWith(`${t.href}/`);
        const I = Icon[t.icon];
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`m-tab ${active ? "active" : ""}`}
          >
            <I className="ico" />
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
        <Icon.More className="ico" />
        <span>More</span>
      </button>
    </nav>
  );
}
