import { notFound } from "next/navigation";
import { Badge, RevisionStatusBadge } from "@/components/ui/badge";
import { DiffTable } from "@/components/revisions/diff-table";
import { getRevisionDiff } from "@/server/queries/revisions";

export default async function DiffPage({
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ left?: string; right?: string }>;
}) {
  const sp = await searchParams;
  if (!sp.left || !sp.right) notFound();

  const diff = await getRevisionDiff(sp.left, sp.right);

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-[20px] font-semibold tracking-tight">Comparing</h1>
        <Badge tone="gray">Rev {diff.left.letter}</Badge>
        <span className="text-[var(--color-text-3)]">→</span>
        <Badge tone="gray">Rev {diff.right.letter}</Badge>
        <RevisionStatusBadge status={diff.right.status as never} />
        <span className="ml-auto text-[13px]">
          Total: {diff.totals.delta >= 0 ? "+" : ""}${diff.totals.delta.toFixed(2)}
        </span>
      </div>

      <div className="mb-4 grid grid-cols-4 gap-2 text-[12px]">
        <Stat label="Added" value={diff.lines.added.length} />
        <Stat label="Removed" value={diff.lines.removed.length} />
        <Stat label="Changed" value={diff.lines.changed.length} />
        <Stat label="Section ops" value={diff.sections.added.length + diff.sections.removed.length + diff.sections.renamed.length + diff.sections.reordered.length} />
      </div>

      <DiffTable diff={diff} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] p-3">
      <div className="text-[11px] uppercase tracking-wider text-[var(--color-text-3)]">{label}</div>
      <div className="mt-0.5 text-[16px] font-semibold tabular-nums">{value}</div>
    </div>
  );
}
