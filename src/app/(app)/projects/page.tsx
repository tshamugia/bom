import Link from "next/link";
import { listProjects } from "@/server/queries/projects";
import { PageHead } from "@/components/master/page-head";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { ProjectRowActions } from "@/components/projects/project-row-actions";

export default async function ProjectsListPage() {
  const list = await listProjects();
  return (
    <>
      <PageHead
        title="Projects"
        subtitle="Owner, deadlines, and lifecycle."
        actions={
          <Link href="/builder">
            <Button><Icon.Plus size={14} className="mr-1.5" /> New BOM</Button>
          </Link>
        }
      />
      <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="bg-[var(--color-surface-2)] text-[11px] uppercase tracking-wider text-[var(--color-text-3)]">
              <th className="px-4 py-2.5 text-left font-medium">Project</th>
              <th className="px-4 py-2.5 text-left font-medium">Owner</th>
              <th className="px-4 py-2.5 text-left font-medium">Status</th>
              <th className="px-4 py-2.5 text-left font-medium">Due</th>
              <th className="px-4 py-2.5 text-right font-medium">Lines</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-[12.5px] text-[var(--color-text-3)]">
                  <div className="text-[13.5px]">No projects yet</div>
                </td>
              </tr>
            ) : (
              list.map(p => (
                <tr key={p.id} className="border-b border-[var(--color-line-soft)] last:border-0 hover:bg-[var(--color-surface-2)]">
                  <td className="px-4 py-2.5">
                    <Link href={`/projects/${p.id}`} className="block">
                      <div className="font-medium">{p.name}</div>
                      <div className="font-mono text-[11px] text-[var(--color-text-3)]">{p.code}</div>
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">{p.ownerName ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    {p.workflowStatus
                      ? <Badge tone="success">Sent to procurement</Badge>
                      : p.status === "in-progress"
                        ? <Badge tone="warning">In progress</Badge>
                        : <Badge tone="gray">{p.status}</Badge>}
                  </td>
                  <td className="px-4 py-2.5 text-[var(--color-text-3)]">{p.targetDate ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{p.lineCount}</td>
                  <td className="px-4 py-2.5 text-right">
                    <ProjectRowActions id={p.id} code={p.code} />
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
