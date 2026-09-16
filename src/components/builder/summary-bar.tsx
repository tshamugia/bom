export function SummaryBar({
  lineCount, totalUnits, vendors,
}: { lineCount: number; totalUnits: number; vendors: number }) {
  return (
    <div className="summary-bar" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
      <Cell label="Lines" value={lineCount} />
      <Cell label="Total units" value={totalUnits.toLocaleString()} />
      <Cell label="Vendors" value={vendors} />
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="summary-cell">
      <div className="lab">{label}</div>
      <div className="val">{value}</div>
    </div>
  );
}
