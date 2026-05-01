export function StatTile({
  label, value, delta, deltaTone = "neutral",
}: {
  label: string;
  value: string | number;
  delta?: string;
  deltaTone?: "up" | "down" | "neutral";
}) {
  const deltaClass = deltaTone === "down"
    ? "bg-[var(--color-danger-soft)] text-[var(--color-danger)]"
    : deltaTone === "up"
    ? "bg-[var(--color-success-soft)] text-[var(--color-success)]"
    : "bg-[var(--color-surface-3)] text-[var(--color-text-2)]";

  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
      <div className="mb-1.5 text-[11.5px] font-medium uppercase tracking-wider text-[var(--color-text-3)]">{label}</div>
      <div className="flex items-baseline gap-2 text-[22px] font-semibold tabular-nums tracking-tight">
        {value}
        {delta && <span className={`rounded-full px-1.5 text-[11.5px] font-medium ${deltaClass}`}>{delta}</span>}
      </div>
    </div>
  );
}
