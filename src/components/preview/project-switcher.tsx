"use client";

import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/icons";

type Project = { id: string; code: string; name: string };

export function ProjectSwitcher({
  active,
  projects,
}: {
  active: { id: string; code: string; name: string };
  projects: Project[];
}) {
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="flex h-7 items-center gap-1.5 rounded-[var(--radius-2)] border border-[var(--color-line)] bg-[var(--color-surface)] px-2 text-[12px] font-medium text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)]"
          >
            <span className="font-mono text-[11px] text-[var(--color-text-3)]">{active.code}</span>
            <span className="text-[var(--color-text)]">{active.name}</span>
            <Icon.ChevDown size={12} className="text-[var(--color-text-3)]" />
          </button>
        }
      />
      <DropdownMenuContent align="start" className="min-w-[260px]">
        <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-3)]">
          Switch project
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {projects.map(p => (
          <DropdownMenuItem
            key={p.id}
            onClick={() => router.push(`/preview/${p.id}`)}
            className="flex items-center gap-2"
          >
            <span className="grid h-4 w-4 place-items-center text-[var(--color-accent)]">
              {p.id === active.id ? <Icon.Check size={12} strokeWidth={3} /> : null}
            </span>
            <span className="font-mono text-[11px] text-[var(--color-text-3)]">{p.code}</span>
            <span className="truncate">{p.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
