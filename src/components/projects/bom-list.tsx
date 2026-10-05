"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";
import { Badge, RevisionStatusBadge } from "@/components/ui/badge";
import { RenameBomDialog } from "@/components/boms/rename-bom-dialog";
import { DeleteBomDialog } from "@/components/boms/delete-bom-dialog";
import { formatDateTime } from "@/lib/format";
import type { RevisionStatus } from "@/lib/bom-status";

export type BomRow = {
  id: string;
  name: string;
  ownerName: string | null;
  lastModifiedByName: string | null;
  activeRevisionId: string | null;
  activeRevisionLetter: string | null;
  activeRevisionStatus: RevisionStatus | null;
  lineCount: number;
  updatedAt: Date | string;
};

export function BomList({
  projectId,
  rows,
  canDelete,
  readOnly = false,
}: {
  projectId: string;
  rows: BomRow[];
  /** Deleting a BOM is admin-only. */
  canDelete: boolean;
  /** Viewers open the read-only preview instead of the builder. */
  readOnly?: boolean;
}) {
  const openHref = (bomId: string) => `/${readOnly ? "preview" : "builder"}/${projectId}/${bomId}`;

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--color-line)] bg-[var(--color-surface)] p-10 text-center max-[701px]:p-6">
        <div className="text-[14px] font-medium">No BOMs yet</div>
        {!readOnly && (
          <div className="mt-1 text-[12.5px] text-[var(--color-text-3)]">
            Click &quot;New BOM&quot; to add the first parts list to this project.
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]">
      <table className="tbl-list w-full text-[12.5px]">
        <thead>
          <tr className="bg-[var(--color-surface-2)] text-[11px] uppercase tracking-wider text-[var(--color-text-3)]">
            <th className="px-4 py-2.5 text-left font-medium">BOM</th>
            <th className="px-4 py-2.5 text-left font-medium">Owner</th>
            <th className="px-4 py-2.5 text-left font-medium">Modified by</th>
            <th className="px-4 py-2.5 text-left font-medium">Status</th>
            <th className="px-4 py-2.5 text-left font-medium">Active Rev</th>
            <th className="px-4 py-2.5 text-right font-medium">Lines</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map(b => (
            <tr key={b.id} className="border-b border-[var(--color-line-soft)] last:border-0 hover:bg-[var(--color-surface-2)]">
              <td className="l-title px-4 py-2.5">
                <Link href={openHref(b.id)} className="block font-medium">
                  {b.name}
                </Link>
              </td>
              <td className="l-hide px-4 py-2.5">{b.ownerName ?? "—"}</td>
              <td className={`${b.lastModifiedByName ? "l-meta" : "l-hide"} px-4 py-2.5`}>
                {b.lastModifiedByName ? (
                  <div className="flex flex-col max-[701px]:inline-flex max-[701px]:flex-row max-[701px]:flex-wrap max-[701px]:gap-x-1">
                    <span>{b.lastModifiedByName}</span>
                    <span className="text-[11px] text-[var(--color-text-3)] max-[701px]:text-[12px]">
                      {formatDateTime(b.updatedAt)}
                    </span>
                  </div>
                ) : "—"}
              </td>
              <td className="l-aside px-4 py-2.5">
                {b.activeRevisionStatus
                  ? <RevisionStatusBadge status={b.activeRevisionStatus} />
                  : <Badge tone="gray">—</Badge>}
              </td>
              <td className="l-meta px-4 py-2.5 font-mono text-[11px] text-[var(--color-text-3)]">
                {b.activeRevisionLetter ? `Rev ${b.activeRevisionLetter}` : "—"}
              </td>
              <td className="l-meta px-4 py-2.5 text-right tabular-nums">
                {b.lineCount}
                <span className="min-[701px]:hidden"> line{b.lineCount === 1 ? "" : "s"}</span>
              </td>
              <td className="l-end px-4 py-2.5 text-right">
                <div className="flex items-center justify-end gap-1.5">
                  <Link href={openHref(b.id)}>
                    <Button variant="ghost" size="sm"><Icon.Box size={14} className="mr-1" /> Open</Button>
                  </Link>
                  {!readOnly && (
                    <RenameBomDialog
                      bomId={b.id}
                      currentName={b.name}
                      trigger={<Button variant="ghost" size="sm" title="Rename"><Icon.Edit size={14} /></Button>}
                    />
                  )}
                  {canDelete && <DeleteBomDialog bomId={b.id} bomName={b.name} iconOnly />}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
