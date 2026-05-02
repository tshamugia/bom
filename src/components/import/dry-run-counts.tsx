import type { DryRunResult } from "@/lib/schemas/import";

export function DryRunCounts({ result }: { result: DryRunResult }) {
  const { counts } = result;
  const items = [
    { label: "Total rows", value: counts.total },
    { label: "To add", value: counts.toAdd },
    { label: "To update", value: counts.toUpdate },
    { label: "Errors", value: counts.errored },
  ];
  return (
    <div className="grid grid-cols-4 gap-3 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
      {items.map(i => (
        <div key={i.label}>
          <div className="text-[11px] uppercase tracking-wider text-[var(--color-text-3)]">{i.label}</div>
          <div className="text-[18px] font-semibold tabular-nums">{i.value.toLocaleString()}</div>
        </div>
      ))}
    </div>
  );
}
