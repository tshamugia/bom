"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";
import { Badge, RevisionStatusBadge } from "@/components/ui/badge";
import { RenameBomDialog } from "@/components/boms/rename-bom-dialog";
import { deleteBom } from "@/server/actions/boms";

export type BomRow = {
  id: string;
  name: string;
  ownerName: string | null;
  activeRevisionId: string | null;
  activeRevisionLetter: string | null;
  activeRevisionStatus: "draft" | "committed" | "in-progress" | "review" | "approved" | "locked" | null;
  lineCount: number;
  updatedAt: Date | string;
};

export function BomList({ projectId, rows }: { projectId: string; rows: BomRow[] }) {
  const router = useRouter();
  const [archiving, startArchive] = useTransition();

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--color-line)] bg-[var(--color-surface)] p-10 text-center">
        <div className="text-[14px] font-medium">No BOMs yet</div>
        <div className="mt-1 text-[12.5px] text-[var(--color-text-3)]">
          Click &quot;New BOM&quot; to add the first parts list to this project.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="bg-[var(--color-surface-2)] text-[11px] uppercase tracking-wider text-[var(--color-text-3)]">
            <th className="px-4 py-2.5 text-left font-medium">BOM</th>
            <th className="px-4 py-2.5 text-left font-medium">Owner</th>
            <th className="px-4 py-2.5 text-left font-medium">Status</th>
            <th className="px-4 py-2.5 text-left font-medium">Active Rev</th>
            <th className="px-4 py-2.5 text-right font-medium">Lines</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map(b => (
            <tr key={b.id} className="border-b border-[var(--color-line-soft)] last:border-0 hover:bg-[var(--color-surface-2)]">
              <td className="px-4 py-2.5">
                <Link href={`/builder/${projectId}/${b.id}`} className="block font-medium">
                  {b.name}
                </Link>
              </td>
              <td className="px-4 py-2.5">{b.ownerName ?? "—"}</td>
              <td className="px-4 py-2.5">
                {b.activeRevisionStatus
                  ? <RevisionStatusBadge status={b.activeRevisionStatus} />
                  : <Badge tone="gray">—</Badge>}
              </td>
              <td className="px-4 py-2.5 font-mono text-[11px] text-[var(--color-text-3)]">
                {b.activeRevisionLetter ? `Rev ${b.activeRevisionLetter}` : "—"}
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">{b.lineCount}</td>
              <td className="px-4 py-2.5 text-right">
                <div className="flex items-center justify-end gap-1.5">
                  <Link href={`/builder/${projectId}/${b.id}`}>
                    <Button variant="ghost" size="sm"><Icon.Box size={14} className="mr-1" /> Open</Button>
                  </Link>
                  <RenameBomDialog
                    bomId={b.id}
                    currentName={b.name}
                    trigger={<Button variant="ghost" size="sm" title="Rename"><Icon.Edit size={14} /></Button>}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={archiving}
                    title="Archive"
                    onClick={() => {
                      if (!confirm(`Archive BOM "${b.name}"? It will be hidden from this project.`)) return;
                      startArchive(async () => {
                        try {
                          await deleteBom({ bomId: b.id });
                          toast.success(`${b.name} archived`);
                          router.refresh();
                        } catch (e) {
                          toast.error(e instanceof Error ? e.message : "Archive failed");
                        }
                      });
                    }}
                  >
                    <Icon.Trash size={14} />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
