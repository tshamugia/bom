"use client";

import { usePathname } from "next/navigation";
import { Icon } from "@/components/icons";

const CRUMBS: Record<string, [string, string]> = {
  "/dashboard": ["Workspace", "Dashboard"],
  "/builder": ["Workspace", "BOM Builder"],
  "/preview": ["Workspace", "Preview & Generate"],
  "/history": ["Workspace", "History"],
  "/catalog": ["Master Data", "Item Catalog"],
  "/vendors": ["Master Data", "Vendors"],
  "/approvals": ["Process", "Approvals"],
};

export function Topbar() {
  const path = usePathname();
  const key = Object.keys(CRUMBS).find(k => path === k || path.startsWith(`${k}/`)) ?? "/dashboard";
  const [section, here] = CRUMBS[key];

  return (
    <header className="sticky top-0 z-20 flex h-13 items-center gap-4 border-b border-[var(--color-line)] bg-[var(--color-surface)] px-6" style={{ height: 52 }}>
      <div className="flex items-center gap-2 text-[13px] text-[var(--color-text-3)]">
        <span>{section}</span>
        <span className="text-[var(--color-text-4)]">/</span>
        <span className="font-medium text-[var(--color-text)]">{here}</span>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <div className="flex w-80 items-center gap-2 rounded-md border border-[var(--color-line)] bg-[var(--color-surface-2)] px-2.5 py-1.5 text-[var(--color-text-3)]">
          <Icon.Search size={14} />
          <input className="flex-1 border-0 bg-transparent text-[12.5px] text-[var(--color-text)] outline-none" placeholder="Search SKUs, projects, vendors…" />
          <span className="rounded border border-[var(--color-line)] bg-[var(--color-surface)] px-1.5 font-mono text-[10.5px] text-[var(--color-text-3)]">⌘K</span>
        </div>
        <button className="grid h-7 w-7 place-items-center rounded-md text-[var(--color-text-3)] hover:bg-[var(--color-surface-2)]">
          <Icon.Bell size={14} />
        </button>
      </div>
    </header>
  );
}
