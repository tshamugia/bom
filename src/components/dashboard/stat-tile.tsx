export function StatTile({
  label,
  value,
  delta,
  deltaTone = "neutral",
}: {
  label: string;
  value: string | number;
  delta?: string;
  deltaTone?: "up" | "down" | "neutral";
  /** kept for call-site compatibility; visual accent comes from grid position */
  tone?: "accent" | "success" | "warning" | "info";
}) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">
        {value}
        {delta && <span className={`stat-delta ${deltaTone === "down" ? "down" : ""}`}>{delta}</span>}
      </div>
    </div>
  );
}
