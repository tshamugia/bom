"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";
import { ApprovalStatusBadge } from "./approval-status-badge";
import { approveStep, rejectStep } from "@/server/actions/approvals";
import { toast } from "sonner";

type Row = {
  workflowId: string;
  projectCode: string;
  projectName: string;
  ownerName: string | null;
  lineCount: number;
  total: number;
  status: "pending" | "approved" | "rejected" | "cancelled";
  age: string;
  activeStepRole: string | null;
};

export function ApprovalsTable({ rows, actionable }: { rows: Row[]; actionable: boolean }) {
  const [pending, start] = useTransition();

  function approve(id: string) {
    start(async () => { await approveStep({ workflowId: id }); toast.success("Approved"); });
  }
  function reject(id: string) {
    const note = window.prompt("Rejection reason (optional):") ?? undefined;
    start(async () => { await rejectStep({ workflowId: id, note }); toast.success("Rejected"); });
  }

  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="bg-[var(--color-surface-2)] text-[11px] uppercase tracking-wider text-[var(--color-text-3)]">
            <th className="px-4 py-2.5 text-left font-medium">BOM</th>
            <th className="px-4 py-2.5 text-left font-medium">Owner</th>
            <th className="px-4 py-2.5 text-right font-medium">Lines</th>
            <th className="px-4 py-2.5 text-right font-medium">Total</th>
            <th className="px-4 py-2.5 text-left font-medium">Waiting</th>
            <th className="px-4 py-2.5 text-left font-medium">Stage</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.workflowId} className="border-b border-[var(--color-line-soft)] last:border-0 hover:bg-[var(--color-surface-2)]">
              <td className="px-4 py-2.5">
                <div className="font-medium">{r.projectName}</div>
                <div className="font-mono text-[11px] text-[var(--color-text-3)]">{r.projectCode}</div>
              </td>
              <td className="px-4 py-2.5">{r.ownerName ?? "—"}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{r.lineCount}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">${r.total.toFixed(2)}</td>
              <td className="px-4 py-2.5 text-[var(--color-text-3)]">{r.age}</td>
              <td className="px-4 py-2.5">
                <ApprovalStatusBadge status={r.status} role={r.activeStepRole} />
              </td>
              <td className="px-4 py-2.5 text-right">
                {actionable && r.status === "pending" && (
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" disabled={pending} onClick={() => reject(r.workflowId)}>Reject</Button>
                    <Button size="sm" disabled={pending} onClick={() => approve(r.workflowId)}>
                      <Icon.Check size={14} className="mr-1.5" /> Approve
                    </Button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
