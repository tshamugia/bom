/** Single-hue meter: the track is a lighter step of the fill's own hue. */
export function Meter({
  value,
  max,
  tone = "accent",
  label,
}: {
  value: number;
  max: number;
  tone?: "accent" | "danger";
  label: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const fill = tone === "danger" ? "var(--red)" : "var(--accent)";
  const track = tone === "danger" ? "var(--red-soft)" : "var(--accent-soft)";
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      title={label}
      style={{ height: 6, borderRadius: 4, background: track, overflow: "hidden", minWidth: 60 }}
    >
      <div style={{ width: `${pct}%`, height: "100%", borderRadius: 4, background: fill }} />
    </div>
  );
}
