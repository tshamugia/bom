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
    <header
      className="sticky top-0 z-20 flex items-center gap-4 border-b border-[var(--color-line)] bg-[var(--color-surface)]/85 px-6 backdrop-blur supports-[backdrop-filter]:bg-[var(--color-surface)]/70"
      style={{ height: 56 }}
    >
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[13px]">
        <span className="font-medium text-[var(--color-text-3)]">{section}</span>
        <Icon.Chevron size={12} className="text-[var(--color-text-4)]" />
        <span className="font-semibold text-[var(--color-text)] tracking-tight">{here}</span>
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <CommandPalette />

        <button
          aria-label="Notifications"
          className="relative grid h-8 w-8 place-items-center rounded-lg text-[var(--color-text-2)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
        >
          <Icon.Bell size={15} />
          <span
            className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full ring-2 ring-[var(--color-surface)]"
            style={{ background: "var(--color-danger)" }}
          />
        </button>
      </div>
    </header>
  );
}
