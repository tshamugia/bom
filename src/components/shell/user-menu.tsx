"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "@/lib/auth-client";
import { Icon } from "@/components/icons";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "./theme-toggle";

type User = {
  name: string;
  email: string;
  role: "owner" | "admin" | "member";
};

export function UserMenu({ user }: { user: User | null }) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const initials = (user?.name ?? "?")
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label="Open account menu"
            className="sb-foot w-full text-left"
          >
            <span className="avatar">{initials}</span>
            <span className="min-w-0" style={{ flex: 1 }}>
              <span className="who block truncate">{user?.name ?? "Anonymous"}</span>
              <span className="who-sub block truncate capitalize">{user?.role ?? ""}</span>
            </span>
            <span className="btn btn-icon btn-ghost" aria-hidden>
              <Icon.Settings className="ico" />
            </span>
          </button>
        }
      />
      <DropdownMenuContent
        align="end"
        side="top"
        sideOffset={8}
        className="w-56"
      >
        {user && (
          <>
            <div className="px-2 py-1.5">
              <div className="truncate text-[13px] font-semibold text-foreground">
                {user.name}
              </div>
              <div className="truncate text-[11.5px] text-muted-foreground">
                {user.email}
              </div>
            </div>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem render={<Link href="/settings/profile" />}>
          <Icon.User size={14} />
          Profile
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/settings" />}>
          <Icon.Settings size={14} />
          Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <ThemeToggle />
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          disabled={signingOut}
          onClick={handleSignOut}
        >
          <Icon.LogOut size={14} />
          {signingOut ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
