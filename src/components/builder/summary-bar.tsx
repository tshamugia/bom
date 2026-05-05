export function SummaryBar({
  lineCount, totalUnits, vendors,
}: { lineCount: number; totalUnits: number; vendors: number }) {
  return (
    <div className="grid grid-cols-3 gap-px border-t border-[var(--color-line)] bg-[var(--color-line-soft)]">
      <Cell label="Lines" value={lineCount} />
      <Cell label="Total units" value={totalUnits.toLocaleString()} />
      <Cell label="Vendors" value={vendors} />
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-[var(--color-surface)] px-4 py-3">
      <div className="mb-0.5 text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-3)]">{label}</div>
      <div className="text-[16px] font-semibold tabular-nums tracking-tight">{value}</div>
    </div>
  );
}
