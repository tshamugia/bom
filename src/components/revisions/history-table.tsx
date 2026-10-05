import Link from "next/link";
import { RevisionStatusBadge } from "@/components/ui/badge";
import { BranchRevisionDialog, type BomOwnerOption } from "./branch-revision-dialog";
import { formatDateTime } from "@/lib/format";
import type { RevisionStatus } from "@/lib/bom-status";
import { ChangeBomStatusDialog } from "@/components/boms/change-bom-status-dialog";

export type HistoryRow = {
  id: string;
  letter: string;
  status: RevisionStatus;
  ownerName: string | null;
  committedByName: string | null;
  committedAt: Date | null;
  commitMessage: string | null;
  parentRevisionId: string | null;
  /** Who last set the client's approval, or took it back. */
  statusChangedByName: string | null;
  sent: boolean;
};

export function HistoryTable({
  projectId, bomId, rows, bomOwner, owners, readOnly = false,
}: {
  projectId: string;
  bomId: string;
  rows: HistoryRow[];
  /** The BOM's current owner — Clone can hand it to someone else with the new draft. */
  bomOwner: { id: string | null; name: string | null };
  owners: BomOwnerOption[];
  readOnly?: boolean;
}) {
  const hasOpenDraft = rows.some(r => r.status === "draft");
  // Rows come newest first; only the latest committed revision changes status.
  const statusRevisionId = rows.find(r => r.status !== "draft")?.id;
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)]">
      <table className="tbl-list w-full text-[13px]">
        <thead className="bg-[var(--color-surface-2)] text-[11px] uppercase tracking-wide text-[var(--color-text-3)]">
          <tr>
            <th className="p-2 text-left">Rev</th>
            <th className="p-2 text-left">Status</th>
            <th className="p-2 text-left">Owner</th>
            <th className="p-2 text-left">Committed by</th>
            <th className="p-2 text-left">When</th>
            <th className="p-2 text-left">Message</th>
            <th className="p-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="border-t border-[var(--color-line-soft)] max-[701px]:border-t-0">
              <td className="l-title p-2 font-semibold"><span className="min-[701px]:hidden">Rev </span>{r.letter}</td>
              <td className="l-aside p-2">
                <RevisionStatusBadge status={r.status} />
                {r.status === "approved" && r.statusChangedByName && (
                  <div className="mt-0.5 text-[11px] text-[var(--color-text-3)] max-[701px]:hidden">by {r.statusChangedByName}</div>
                )}
              </td>
              <td className="l-meta p-2">{r.ownerName ?? "—"}</td>
              <td className="l-meta p-2">{r.committedByName ?? "—"}</td>
              <td className="l-meta p-2">{r.committedAt ? formatDateTime(r.committedAt) : (r.status === "draft" ? "in progress" : "—")}</td>
              <td className={`${r.commitMessage ? "l-line" : "l-hide"} p-2 italic text-[var(--color-text-2)] max-[701px]:[overflow-wrap:anywhere]`}>{r.commitMessage ?? "—"}</td>
              <td className={`${r.parentRevisionId || (!readOnly && r.status !== "draft") ? "l-end" : "l-hide"} p-2 text-right`}>
                <div className="flex flex-wrap items-center justify-end gap-3">
                  {r.parentRevisionId
                    ? <Link className="text-[var(--color-info)] hover:underline" href={`/projects/${projectId}/diff?left=${r.parentRevisionId}&right=${r.id}`}>Diff vs parent</Link>
                    : null}
                  {!readOnly && r.id === statusRevisionId ? (
                    <ChangeBomStatusDialog revisionId={r.id} letter={r.letter} status={r.status} sent={r.sent} compact />
                  ) : null}
                  {!readOnly && r.status !== "draft" ? (
                    <BranchRevisionDialog
                      variant="clone"
                      parentRevisionId={r.id}
                      parentLetter={r.letter}
                      projectId={projectId}
                      bomId={bomId}
                      hasOpenDraft={hasOpenDraft}
                      owner={bomOwner}
                      owners={owners}
                    />
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
