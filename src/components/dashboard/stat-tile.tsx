export function StatTile({
  label,
  value,
  delta,
  deltaTone = "neutral",
  tone = "accent",
}: {
  label: string;
  value: string | number;
  delta?: string;
  deltaTone?: "up" | "down" | "neutral";
  tone?: "accent" | "success" | "warning" | "info";
}) {
  const toneVar =
    tone === "success" ? "var(--color-success)"
    : tone === "warning" ? "var(--color-warning)"
    : tone === "info" ? "var(--color-info)"
    : "var(--color-accent)";

  const deltaClass =
    deltaTone === "down"
      ? "bg-[var(--color-danger-soft)] text-[var(--color-danger)]"
      : deltaTone === "up"
      ? "bg-[var(--color-success-soft)] text-[var(--color-success)]"
      : "bg-[var(--color-surface-3)] text-[var(--color-text-2)]";

  return (
    <div className="group relative overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-elev)]">
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{ background: toneVar }}
      />
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-3)]">
        {label}
      </div>
      <div className="flex items-baseline gap-2 text-[26px] font-semibold leading-none tabular-nums tracking-tight text-[var(--color-text)]">
        {value}
        {delta && (
          <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${deltaClass}`}>
            {delta}
          </span>
        )}
      </div>
    </div>
  );
}
