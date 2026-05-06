import Link from "next/link";
import { RevisionStatusBadge } from "@/components/ui/badge";
import { CloneRevisionButton } from "./clone-revision-button";

export type HistoryRow = {
  id: string;
  letter: string;
  status: "draft" | "committed" | "in-progress" | "review" | "approved" | "locked";
  committedByName: string | null;
  committedAt: Date | null;
  commitMessage: string | null;
  parentRevisionId: string | null;
};

export function HistoryTable({ projectId, rows }: { projectId: string; rows: HistoryRow[] }) {
  const hasOpenDraft = rows.some(r => r.status === "draft");
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)]">
      <table className="w-full text-[13px]">
        <thead className="bg-[var(--color-surface-2)] text-[11px] uppercase tracking-wide text-[var(--color-text-3)]">
          <tr>
            <th className="p-2 text-left">Rev</th>
            <th className="p-2 text-left">Status</th>
            <th className="p-2 text-left">Committed by</th>
            <th className="p-2 text-left">When</th>
            <th className="p-2 text-left">Message</th>
            <th className="p-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="border-t border-[var(--color-line-soft)]">
              <td className="p-2 font-semibold">{r.letter}</td>
              <td className="p-2"><RevisionStatusBadge status={r.status} /></td>
              <td className="p-2">{r.committedByName ?? "—"}</td>
              <td className="p-2">{r.committedAt ? new Date(r.committedAt).toLocaleString() : (r.status === "draft" ? "in progress" : "—")}</td>
              <td className="p-2 italic text-[var(--color-text-2)]">{r.commitMessage ?? "—"}</td>
              <td className="p-2 text-right">
                <div className="flex items-center justify-end gap-3">
                  {r.parentRevisionId
                    ? <Link className="text-[var(--color-info)] hover:underline" href={`/projects/${projectId}/diff?left=${r.parentRevisionId}&right=${r.id}`}>Diff vs parent</Link>
                    : null}
                  {r.status !== "draft" ? (
                    <CloneRevisionButton
                      revisionId={r.id}
                      letter={r.letter}
                      projectId={projectId}
                      hasOpenDraft={hasOpenDraft}
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
