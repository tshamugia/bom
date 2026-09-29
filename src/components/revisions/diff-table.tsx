import type { RevisionDiff } from "@/server/queries/revisions";

export function DiffTable({ diff }: { diff: RevisionDiff }) {
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)]">
      <table className="tbl-list w-full text-[13px]">
        <thead className="bg-[var(--color-surface-2)] text-[11px] uppercase tracking-wide text-[var(--color-text-3)]">
          <tr>
            <th className="w-8 p-2"></th>
            <th className="p-2 text-left">SKU</th>
            <th className="p-2 text-left">Description</th>
            <th className="p-2 text-right">Qty</th>
            <th className="p-2 text-left">Vendor</th>
            <th className="p-2 text-left">Section</th>
          </tr>
        </thead>
        <tbody>
          {diff.lines.added.map(l => (
            <tr key={`a-${l.itemId}`} style={{ background: "var(--color-success-soft)" }}>
              <td className="p-2 font-semibold text-[var(--color-success)]">+</td>
              <td className="l-title p-2 max-[701px]:font-mono max-[701px]:text-[12.5px]!">{l.sku}</td>
              <td className="l-line p-2">{l.description}</td>
              <td className="l-aside p-2 text-right tabular-nums"><span className="min-[701px]:hidden">Qty </span>{l.qty}</td>
              <td className={`${l.vendor ? "l-meta" : "l-hide"} p-2`}>{l.vendor ?? "—"}</td>
              <td className={`${l.section ? "l-meta" : "l-hide"} p-2`}>{l.section ?? "—"}</td>
            </tr>
          ))}
          {diff.lines.changed.map(c => (
            <tr key={`c-${c.itemId}`} style={{ background: "var(--color-warning-soft)" }}>
              <td className="p-2 font-semibold text-[var(--color-warning)]">~</td>
              <td className="l-title p-2 max-[701px]:font-mono max-[701px]:text-[12.5px]!">{c.changes.sku ? <><s>{c.changes.sku.from}</s> → <strong>{c.changes.sku.to}</strong></> : c.display.sku}</td>
              <td className="l-line p-2">{c.changes.description ? <><s>{c.changes.description.from}</s> → <strong>{c.changes.description.to}</strong></> : c.display.description}</td>
              <td className={`${c.changes.qty ? "l-aside" : "l-hide"} p-2 text-right tabular-nums`}>{c.changes.qty ? <>{c.changes.qty.from} → <strong>{c.changes.qty.to}</strong></> : "—"}</td>
              <td className={`${c.changes.vendor ? "l-meta" : "l-hide"} p-2`}>{c.changes.vendor ? <>{c.changes.vendor.from ?? "—"} → <strong>{c.changes.vendor.to ?? "—"}</strong></> : "—"}</td>
              <td className={`${c.changes.section ? "l-meta" : "l-hide"} p-2`}>{c.changes.section ? <>{c.changes.section.from ?? "—"} → <strong>{c.changes.section.to ?? "—"}</strong></> : "—"}</td>
            </tr>
          ))}
          {diff.lines.removed.map(l => (
            <tr key={`r-${l.itemId}`} style={{ background: "var(--color-danger-soft)" }}>
              <td className="p-2 font-semibold text-[var(--color-danger)]">−</td>
              <td className="l-title p-2 line-through max-[701px]:font-mono max-[701px]:text-[12.5px]!">{l.sku}</td>
              <td className="l-line p-2 line-through">{l.description}</td>
              <td className="l-aside p-2 text-right tabular-nums line-through"><span className="min-[701px]:hidden">Qty </span>{l.qty}</td>
              <td className={`${l.vendor ? "l-meta" : "l-hide"} p-2 line-through`}>{l.vendor ?? "—"}</td>
              <td className={`${l.section ? "l-meta" : "l-hide"} p-2 line-through`}>{l.section ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
