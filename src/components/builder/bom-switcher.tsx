"use client";

import { useState } from "react";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/icons";
import { NewBomDialog } from "@/components/boms/new-bom-dialog";
import { RenameBomDialog } from "@/components/boms/rename-bom-dialog";

export type SwitcherBom = {
  id: string;
  name: string;
  activeRevisionLetter: string | null;
};

export function BomSwitcher({
  projectId,
  currentBomId,
  currentBomName,
  boms,
}: {
  projectId: string;
  currentBomId: string;
  currentBomName: string;
  boms: SwitcherBom[];
}) {
  const [renameOpen, setRenameOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="-mx-1.5 -my-0.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[14px] font-medium text-[var(--color-text-2)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)] focus:outline-none data-popup-open:bg-[var(--color-surface-2)]"
          aria-label="Switch BOM"
        >
          {currentBomName}
          <Icon.ChevDown size={13} className="text-[var(--color-text-3)]" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[260px]">
          <DropdownMenuLabel>BOMs in this project ({boms.length})</DropdownMenuLabel>
          {boms.map(b => {
            const active = b.id === currentBomId;
            return (
              <DropdownMenuItem key={b.id} render={<Link href={`/builder/${projectId}/${b.id}`} />}>
                {active ? <Icon.Check size={14} /> : <span className="w-3.5 shrink-0" />}
                <span className="flex-1 truncate">{b.name}</span>
                <span className="font-mono text-[11px] text-[var(--color-text-3)]">
                  {b.activeRevisionLetter ? `Rev ${b.activeRevisionLetter}` : "—"}
                </span>
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setNewOpen(true)}>
            <Icon.Plus size={14} /> New BOM…
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setRenameOpen(true)}>
            <Icon.Edit size={14} /> Rename &ldquo;{currentBomName}&rdquo;…
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href={`/projects/${projectId}`} />}>
            <Icon.List size={14} /> Manage all BOMs
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <RenameBomDialog
        bomId={currentBomId}
        currentName={currentBomName}
        open={renameOpen}
        onOpenChange={setRenameOpen}
      />
      <NewBomDialog projectId={projectId} open={newOpen} onOpenChange={setNewOpen} />
    </>
  );
}
