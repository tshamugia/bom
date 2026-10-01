"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icons";
import { HelpTip } from "@/components/help/help-tip";
import { CommandPalette } from "./command-palette";

const CRUMBS: Record<string, [string, string]> = {
  "/dashboard": ["Workspace", "Dashboard"],
  "/projects": ["Workspace", "Projects"],
  "/builder": ["Workspace", "BOM Builder"],
  "/preview": ["Workspace", "Preview & Generate"],
  "/drawings": ["Workspace", "Drawings"],
  "/history": ["Workspace", "History"],
  "/catalog": ["Master Data", "Item Catalog"],
  "/vendors": ["Master Data", "Vendors"],
  "/approvals": ["Process", "Sent"],
  "/users": ["Admin", "Users"],
  "/audit": ["Admin", "Audit log"],
  "/settings": ["Account", "Settings"],
  "/help": ["Account", "Help"],
};

export function Topbar({
  onMenuToggle,
  navOpen,
  readOnly = false,
}: {
  onMenuToggle?: () => void;
  navOpen?: boolean;
  readOnly?: boolean;
}) {
  const path = usePathname();
  const key = Object.keys(CRUMBS).find(k => path === k || path.startsWith(`${k}/`)) ?? "/projects";
  const [section, crumb] = CRUMBS[key];
  const here = !readOnly ? crumb : key === "/dashboard" ? "Overview" : key === "/preview" ? "BOMs" : crumb;

  return (
    <header className="topbar">
      <button
        type="button"
        className="btn btn-icon btn-ghost tb-menu"
        aria-label="Toggle navigation"
        aria-expanded={navOpen ?? false}
        onClick={onMenuToggle}
      >
        <Icon.Menu className="ico" />
      </button>

      <nav aria-label="Breadcrumb" className="crumbs">
        <span>{section}</span>
        <span className="sep">/</span>
        <span className="here">{here}</span>
      </nav>

      <div className="tb-actions">
        {readOnly && (
          <span className="pill tb-role max-[700.98px]:hidden">
            <Icon.Eye className="ico" aria-hidden /> View only
            <HelpTip topic="roles" />
          </span>
        )}
        <Link
          href="/help"
          className="btn btn-icon btn-ghost"
          aria-label="Help"
          title="Help"
          aria-current={key === "/help" ? "page" : undefined}
        >
          <Icon.Help className="ico" />
        </Link>
        <CommandPalette viewer={readOnly} />
      </div>
    </header>
  );
}
