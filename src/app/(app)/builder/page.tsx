import Link from "next/link";
import { listProjects } from "@/server/queries/projects";
import { PageHead } from "@/components/master/page-head";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";
import { Badge } from "@/components/master/status-badge";
import { ApprovalStatusBadge } from "@/components/approvals/approval-status-badge";
import { ProjectCreateButton } from "@/components/builder/project-picker";

export default async function BuilderIndex() {
  const list = await listProjects();
  return (
    <>
      <PageHead
        title="BOM Builder"
        subtitle="Pick a project to edit, or start a new BOM."
        actions={<ProjectCreateButton />}
      />
      <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="bg-[var(--color-surface-2)] text-[11px] uppercase tracking-wider text-[var(--color-text-3)]">
              <th className="px-4 py-2.5 text-left font-medium">Project</th>
              <th className="px-4 py-2.5 text-right font-medium">Lines</th>
              <th className="px-4 py-2.5 text-right font-medium">Total</th>
              <th className="px-4 py-2.5 text-left font-medium">Status</th>
              <th className="px-4 py-2.5 text-left font-medium">Target</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-[12.5px] text-[var(--color-text-3)]">
                  <div className="text-[13.5px]">No projects yet</div>
                  <div className="mt-1">Click &quot;New BOM&quot; to create your first project.</div>
                </td>
              </tr>
            ) : (
              list.map(p => (
                <tr key={p.id} className="border-b border-[var(--color-line-soft)] last:border-0 hover:bg-[var(--color-surface-2)]">
                  <td className="px-4 py-2.5">
                    <Link href={`/builder/${p.id}`} className="block">
                      <div className="font-medium">{p.name}</div>
                      <div className="font-mono text-[11px] text-[var(--color-text-3)]">{p.code}</div>
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{p.lineCount}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">${p.total.toFixed(2)}</td>
                  <td className="px-4 py-2.5">
                    {p.workflowStatus
                      ? <ApprovalStatusBadge status={p.workflowStatus} role={p.workflowActiveRole} />
                      : <Badge tone={p.status === "approved" ? "success" : p.status === "in-progress" ? "info" : "gray"}>{p.status}</Badge>}
                  </td>
                  <td className="px-4 py-2.5 text-[var(--color-text-3)]">{p.targetDate ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Link href={`/builder/${p.id}`}>
                      <Button variant="ghost" size="sm"><Icon.Chevron size={14} /></Button>
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
