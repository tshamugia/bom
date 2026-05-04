import Link from "next/link";
import { listProjects } from "@/server/queries/projects";
import { PageHead } from "@/components/master/page-head";
import { Badge } from "@/components/ui/badge";

export default async function PreviewIndex() {
  const list = await listProjects();
  return (
    <>
      <PageHead title="Preview & Generate" subtitle="Pick a project to preview and export." />
      <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-card)] divide-y divide-[var(--color-line-soft)]">
        {list.map(p => (
          <Link key={p.id} href={`/preview/${p.id}`} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-[var(--color-surface-2)]">
            <div className="min-w-0">
              <div className="font-medium">{p.name}</div>
              <div className="font-mono text-[11px] text-[var(--color-text-3)]">{p.code}</div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-[var(--color-text-3)]">
                <span>{p.ownerName ?? "—"}</span>
                <span>·</span>
                <span className="font-mono text-[11px]">{p.revLetter ? `Rev ${p.revLetter}` : "—"}</span>
                <span>·</span>
                {p.workflowStatus
                  ? <Badge tone="success">Sent to procurement</Badge>
                  : p.status === "in-progress"
                    ? <Badge tone="warning">In progress</Badge>
                    : <Badge tone="gray">{p.status}</Badge>}
                <span>·</span>
                <span>{p.targetDate ?? "—"}</span>
              </div>
            </div>
            <div className="shrink-0 text-[12.5px] text-[var(--color-text-3)]">{p.lineCount} lines · ${p.total.toFixed(2)}</div>
          </Link>
        ))}
      </div>
    </>
  );
}
