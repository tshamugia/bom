"use client";

import { usePathname } from "next/navigation";
import { Icon } from "@/components/icons";
import { CommandPalette } from "./command-palette";

const CRUMBS: Record<string, [string, string]> = {
  "/dashboard": ["Workspace", "Dashboard"],
  "/projects": ["Workspace", "Projects"],
  "/builder": ["Workspace", "BOM Builder"],
  "/preview": ["Workspace", "Preview & Generate"],
  "/history": ["Workspace", "History"],
  "/catalog": ["Master Data", "Item Catalog"],
  "/vendors": ["Master Data", "Vendors"],
  "/approvals": ["Process", "Approvals"],
  "/users": ["Admin", "Users"],
  "/settings": ["Account", "Settings"],
};

export function Topbar() {
  const path = usePathname();
  const key = Object.keys(CRUMBS).find(k => path === k || path.startsWith(`${k}/`)) ?? "/projects";
  const [section, here] = CRUMBS[key];

  return (
    <header className="topbar">
      <nav aria-label="Breadcrumb" className="crumbs">
        <span>{section}</span>
        <span className="sep">/</span>
        <span className="here">{here}</span>
      </nav>

      <div className="tb-actions">
        <CommandPalette />

        <button className="btn btn-icon btn-ghost" aria-label="Notifications" title="Notifications">
          <Icon.Bell className="ico" />
        </button>
        <button className="btn btn-ghost btn-sm">
          <Icon.Spark className="ico" /> What&apos;s new
        </button>
      </div>
    </header>
  );
}
