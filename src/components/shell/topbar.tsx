"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";
import { Icon } from "@/components/icons";

const CRUMBS: Record<string, [string, string]> = {
  "/dashboard": ["Workspace", "Dashboard"],
  "/builder": ["Workspace", "BOM Builder"],
  "/preview": ["Workspace", "Preview & Generate"],
  "/history": ["Workspace", "History"],
  "/catalog": ["Master Data", "Item Catalog"],
  "/vendors": ["Master Data", "Vendors"],
  "/approvals": ["Process", "Approvals"],
  "/users": ["Admin", "Users"],
};

export function Topbar({ user }: { user: { name: string; email: string; role: string } }) {
  const path = usePathname();
  const router = useRouter();
  const key = Object.keys(CRUMBS).find(k => path === k || path.startsWith(`${k}/`)) ?? "/dashboard";
  const [section, here] = CRUMBS[key];

  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    router.push("/sign-in");
    router.refresh();
  }

  const initials = user.name.split(" ").map(s => s[0]).join("").slice(0, 2).toUpperCase();

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
        <label className="group flex w-80 items-center gap-2 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-2)] px-2.5 py-1.5 text-[var(--color-text-3)] transition-colors focus-within:border-[var(--color-accent)] focus-within:bg-[var(--color-surface)] focus-within:ring-2 focus-within:ring-[var(--color-accent-soft)]">
          <Icon.Search size={14} className="group-focus-within:text-[var(--color-accent)]" />
          <input
            className="flex-1 border-0 bg-transparent text-[13px] text-[var(--color-text)] placeholder:text-[var(--color-text-4)] outline-none"
            placeholder="Search SKUs, projects, vendors…"
          />
          <span className="rounded border border-[var(--color-line)] bg-[var(--color-surface)] px-1.5 font-mono text-[10.5px] font-medium text-[var(--color-text-3)]">
            ⌘K
          </span>
        </label>

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

        <div className="relative" ref={menuRef}>
          <button
            aria-label="User menu"
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen(o => !o)}
            className="grid h-8 w-8 place-items-center rounded-full text-[12px] font-semibold text-white"
            style={{ background: "linear-gradient(135deg, var(--color-cat-indigo) 0%, var(--color-cat-violet) 100%)" }}
          >
            {initials}
          </button>
          {open && (
            <div
              role="menu"
              className="absolute right-0 top-9 z-30 w-56 overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]"
            >
              <div className="border-b border-[var(--color-line)] px-3 py-2.5">
                <div className="truncate text-[13px] font-semibold text-[var(--color-text)]">{user.name}</div>
                <div className="truncate text-[11.5px] text-[var(--color-text-3)]">{user.email}</div>
                <div className="mt-1 inline-block rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10.5px] font-medium uppercase tracking-wide text-[var(--color-text-2)]">
                  {user.role}
                </div>
              </div>
              <button
                role="menuitem"
                onClick={handleSignOut}
                disabled={signingOut}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-[var(--color-text)] hover:bg-[var(--color-surface-2)] disabled:opacity-50"
              >
                <Icon.LogOut size={14} />
                {signingOut ? "Signing out…" : "Sign out"}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
