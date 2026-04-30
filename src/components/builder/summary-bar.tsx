export function SummaryBar({
  lineCount, totalUnits, vendors, totalValue,
}: { lineCount: number; totalUnits: number; vendors: number; totalValue: number }) {
  return (
    <div className="grid grid-cols-4 gap-px border-t border-[var(--color-line)] bg-[var(--color-line-soft)]">
      <Cell label="Lines" value={lineCount} />
      <Cell label="Total units" value={totalUnits.toLocaleString()} />
      <Cell label="Vendors" value={vendors} />
      <Cell label="Total value" value={`$${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} />
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
