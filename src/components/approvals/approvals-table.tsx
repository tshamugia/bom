import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";

type Row = {
  workflowId: string;
  projectCode: string;
  projectName: string;
  ownerName: string | null;
  revLetter: string | null;
  lineCount: number;
  status: "pending" | "approved" | "rejected" | "cancelled";
  age: string;
  latestExportId: string | null;
  latestExportFileName: string | null;
};

export function ApprovalsTable({ rows }: { rows: Row[] }) {
  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="bg-[var(--color-surface-2)] text-[11px] uppercase tracking-wider text-[var(--color-text-3)]">
            <th className="px-4 py-2.5 text-left font-medium">BOM</th>
            <th className="px-4 py-2.5 text-left font-medium">Owner</th>
            <th className="px-4 py-2.5 text-left font-medium">Rev</th>
            <th className="px-4 py-2.5 text-right font-medium">Lines</th>
            <th className="px-4 py-2.5 text-left font-medium">Sent</th>
            <th className="px-4 py-2.5 text-left font-medium">Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-12 text-center text-[12.5px] text-[var(--color-text-3)]">
                No BOMs have been sent yet.
              </td>
            </tr>
          ) : (
            rows.map(r => (
              <tr key={r.workflowId} className="border-b border-[var(--color-line-soft)] last:border-0 hover:bg-[var(--color-surface-2)]">
                <td className="px-4 py-2.5">
                  <div className="font-medium">{r.projectName}</div>
                  <div className="font-mono text-[11px] text-[var(--color-text-3)]">{r.projectCode}</div>
                </td>
                <td className="px-4 py-2.5">{r.ownerName ?? "—"}</td>
                <td className="px-4 py-2.5 font-mono text-[11px] text-[var(--color-text-3)]">{r.revLetter ? `Rev ${r.revLetter}` : "—"}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{r.lineCount}</td>
                <td className="px-4 py-2.5 text-[var(--color-text-3)]">{r.age} ago</td>
                <td className="px-4 py-2.5">
                  <Badge tone="success">Sent to procurement</Badge>
                </td>
                <td className="px-4 py-2.5 text-right">
                  {r.latestExportId ? (
                    <Link href={`/api/exports/${r.latestExportId}/download`} target="_blank">
                      <Button variant="ghost" size="sm" title={r.latestExportFileName ?? "Download"}><Icon.Download size={14} /></Button>
                    </Link>
                  ) : (
                    <span className="text-[var(--color-text-3)]">—</span>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
