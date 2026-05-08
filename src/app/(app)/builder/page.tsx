import Link from "next/link";
import { listAllBoms, listProjectsForPicker } from "@/server/queries/boms";
import { PageHead } from "@/components/master/page-head";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";
import { Badge, RevisionStatusBadge } from "@/components/ui/badge";
import { NewBomDialog } from "@/components/boms/new-bom-dialog";

export default async function BuilderIndex() {
  const [boms, projects] = await Promise.all([listAllBoms(), listProjectsForPicker()]);
  return (
    <>
      <PageHead
        title="BOM Builder"
        subtitle="All BOMs across projects. Pick one to edit, or start a new one."
        actions={<NewBomDialog projects={projects} />}
      />
      <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="bg-[var(--color-surface-2)] text-[11px] uppercase tracking-wider text-[var(--color-text-3)]">
              <th className="px-4 py-2.5 text-left font-medium">BOM</th>
              <th className="px-4 py-2.5 text-left font-medium">Project</th>
              <th className="px-4 py-2.5 text-left font-medium">Owner</th>
              <th className="px-4 py-2.5 text-left font-medium">Status</th>
              <th className="px-4 py-2.5 text-left font-medium">Active Rev</th>
              <th className="px-4 py-2.5 text-right font-medium">Lines</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {boms.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-[12.5px] text-[var(--color-text-3)]">
                  <div className="text-[13.5px]">No BOMs yet</div>
                  <div className="mt-1">Click &quot;New BOM&quot; to create your first BOM.</div>
                </td>
              </tr>
            ) : (
              boms.map(b => (
                <tr key={b.id} className="border-b border-[var(--color-line-soft)] last:border-0 hover:bg-[var(--color-surface-2)]">
                  <td className="px-4 py-2.5">
                    <Link href={`/builder/${b.projectId}/${b.id}`} className="block font-medium">
                      {b.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <Link href={`/projects/${b.projectId}`} className="block">
                      <div className="font-medium">{b.projectName}</div>
                      <div className="font-mono text-[11px] text-[var(--color-text-3)]">{b.projectCode}</div>
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">{b.ownerName ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    {b.activeRevisionStatus
                      ? <RevisionStatusBadge status={b.activeRevisionStatus as "draft" | "committed" | "in-progress" | "review" | "approved" | "locked"} />
                      : <Badge tone="gray">—</Badge>}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-[var(--color-text-3)]">
                    {b.activeRevisionLetter ? `Rev ${b.activeRevisionLetter}` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{b.lineCount}</td>
                  <td className="px-4 py-2.5 text-right">
                    <Link href={`/builder/${b.projectId}/${b.id}`}>
                      <Button variant="ghost" size="sm"><Icon.Box size={14} className="mr-1" /> Open</Button>
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
