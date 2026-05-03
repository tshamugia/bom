import Link from "next/link";
import { RevisionStatusBadge } from "@/components/ui/badge";

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
            <th className="p-2 text-right">Action</th>
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
                {r.parentRevisionId
                  ? <Link className="text-[var(--color-info)] hover:underline" href={`/projects/${projectId}/diff?left=${r.parentRevisionId}&right=${r.id}`}>Diff vs parent</Link>
                  : <span className="text-[var(--color-text-3)]">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
