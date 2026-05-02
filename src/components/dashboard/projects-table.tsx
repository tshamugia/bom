import Link from "next/link";
import { ApprovalStatusBadge } from "@/components/approvals/approval-status-badge";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";

type Row = {
  id: string;
  code: string;
  name: string;
  status: string;
  updatedAt: Date;
  targetDate: string | null;
  lineCount: number;
  total: number;
  workflowStatus: "pending" | "approved" | "rejected" | null;
  workflowActiveRole: string | null;
};

export function ProjectsTable({ rows }: { rows: Row[] }) {
  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-2 border-b border-[var(--color-line-soft)] px-4 py-3">
        <h3 className="text-[13.5px] font-semibold">Projects</h3>
        <span className="text-[12px] text-[var(--color-text-3)]">{rows.length} active</span>
      </div>
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="bg-[var(--color-surface-2)] text-[11px] uppercase tracking-wider text-[var(--color-text-3)]">
            <th className="px-4 py-2.5 text-left font-medium">Project</th>
            <th className="px-4 py-2.5 text-right font-medium">Lines</th>
            <th className="px-4 py-2.5 text-right font-medium">Total</th>
            <th className="px-4 py-2.5 text-left font-medium">Status</th>
            <th className="px-4 py-2.5 text-left font-medium">Updated</th>
            <th className="px-4 py-2.5 text-left font-medium">Target</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map(p => (
            <tr key={p.id} className="cursor-pointer border-b border-[var(--color-line-soft)] last:border-0 hover:bg-[var(--color-surface-2)]">
              <td className="px-4 py-2.5">
                <Link href={`/builder/${p.id}`} className="flex items-center gap-2.5">
                  <Icon.Folder size={14} className="text-[var(--color-text-3)]" />
                  <div>
                    <div className="font-medium">{p.name}</div>
                    <div className="font-mono text-[11px] text-[var(--color-text-3)]">{p.code}</div>
                  </div>
                </Link>
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums">{p.lineCount}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">${p.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              <td className="px-4 py-2.5">
                {p.workflowStatus
                  ? <ApprovalStatusBadge status={p.workflowStatus} role={p.workflowActiveRole} />
                  : <Badge tone={p.status === "approved" ? "success" : p.status === "in-progress" ? "info" : "gray"}>{p.status}</Badge>}
              </td>
              <td className="px-4 py-2.5 text-[var(--color-text-3)]">{relativeTime(p.updatedAt)}</td>
              <td className="px-4 py-2.5 text-[var(--color-text-3)]">{p.targetDate ?? "—"}</td>
              <td className="px-4 py-2.5 text-right">
                <Link href={`/builder/${p.id}`}><Button variant="ghost" size="sm"><Icon.Chevron size={14} /></Button></Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function relativeTime(d: Date | string) {
  const ms = Date.now() - new Date(d).getTime();
  const h = ms / 3_600_000;
  if (h < 1)  return `${Math.max(1, Math.round(ms / 60_000))}m ago`;
  if (h < 24) return `${Math.round(h)}h ago`;
  const days = Math.round(h / 24);
  return days === 1 ? "1d ago" : days < 14 ? `${days}d ago` : `${Math.round(days / 7)}w ago`;
}
