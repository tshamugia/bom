export function SummaryCard({ lines, totalUnits, vendors }: {
  lines: number; totalUnits: number; vendors: number;
}) {
  return (
    <div className="card">
      <div className="card-head"><h3 className="card-title">Summary</h3></div>
      <div style={{ padding: "12px 16px" }}>
        <dl className="kv">
          <dt>Lines</dt><dd>{lines}</dd>
          <dt>Total units</dt><dd>{totalUnits.toLocaleString()}</dd>
          <dt>Vendors</dt><dd>{vendors}</dd>
        </dl>
      </div>
    </div>
  );
}
