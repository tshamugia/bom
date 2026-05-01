import Link from "next/link";
import { listProjects } from "@/server/queries/projects";
import { PageHead } from "@/components/master/page-head";

export default async function PreviewIndex() {
  const list = await listProjects();
  return (
    <>
      <PageHead title="Preview & Generate" subtitle="Pick a project to preview and export." />
      <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-card)] divide-y divide-[var(--color-line-soft)]">
        {list.map(p => (
          <Link key={p.id} href={`/preview/${p.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-[var(--color-surface-2)]">
            <div>
              <div className="font-medium">{p.name}</div>
              <div className="font-mono text-[11px] text-[var(--color-text-3)]">{p.code}</div>
            </div>
            <div className="text-[12.5px] text-[var(--color-text-3)]">{p.lineCount} lines · ${p.total.toFixed(2)}</div>
          </Link>
        ))}
      </div>
    </>
  );
}
