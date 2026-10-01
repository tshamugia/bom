"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { MobileTabs } from "./mobile-tabs";
import type { UserRole } from "@/lib/roles";
import { recordPathname } from "@/lib/nav-history";

type ShellUser = { name: string; email: string; role: UserRole };

export function ShellChrome({
  user,
  pendingReceipts = 0,
  children,
}: {
  user: ShellUser;
  /** Drawing revisions issued to this user that they haven't confirmed yet. */
  pendingReceipts?: number;
  children: React.ReactNode;
}) {
  const [navOpen, setNavOpen] = useState(false);
  const pathname = usePathname();

  // Close the mobile drawer whenever the route changes (sync UI to the router),
  // and remember the page we came from for the "← Back" links.
  useEffect(() => {
    recordPathname(pathname);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to external router state
    setNavOpen(false);
  }, [pathname]);

  // Lock body scroll while the drawer is open on mobile.
  useEffect(() => {
    if (!navOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [navOpen]);

  return (
    <div className="app" data-nav-open={navOpen || undefined}>
      <Sidebar user={user} pendingReceipts={pendingReceipts} onNavigate={() => setNavOpen(false)} />
      <button
        type="button"
        className="nav-scrim"
        aria-label="Close navigation"
        tabIndex={navOpen ? 0 : -1}
        onClick={() => setNavOpen(false)}
      />
      <div className="main">
        <Topbar
          onMenuToggle={() => setNavOpen((v) => !v)}
          navOpen={navOpen}
          readOnly={user.role === "viewer"}
        />
        <div className="content">{children}</div>
      </div>
      <MobileTabs
        onMore={() => setNavOpen((v) => !v)}
        navOpen={navOpen}
        role={user.role}
        badge={user.role === "viewer" ? pendingReceipts : 0}
      />
    </div>
  );
}
