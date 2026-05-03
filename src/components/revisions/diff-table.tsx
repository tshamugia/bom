import type { RevisionDiff } from "@/server/queries/revisions";

export function DiffTable({ diff }: { diff: RevisionDiff }) {
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)]">
      <table className="w-full text-[13px]">
        <thead className="bg-[var(--color-surface-2)] text-[11px] uppercase tracking-wide text-[var(--color-text-3)]">
          <tr>
            <th className="w-8 p-2"></th>
            <th className="p-2 text-left">SKU</th>
            <th className="p-2 text-left">Description</th>
            <th className="p-2 text-right">Qty</th>
            <th className="p-2 text-right">Price</th>
            <th className="p-2 text-left">Vendor</th>
            <th className="p-2 text-left">Section</th>
          </tr>
        </thead>
        <tbody>
          {diff.lines.added.map(l => (
            <tr key={`a-${l.itemId}`} className="bg-[var(--color-success-soft)]">
              <td className="p-2 font-semibold text-[var(--color-success)]">+</td>
              <td className="p-2">{l.sku}</td>
              <td className="p-2">{l.description}</td>
              <td className="p-2 text-right tabular-nums">{l.qty}</td>
              <td className="p-2 text-right tabular-nums">${l.unitPrice.toFixed(2)}</td>
              <td className="p-2">{l.vendor ?? "—"}</td>
              <td className="p-2">{l.section ?? "—"}</td>
            </tr>
          ))}
          {diff.lines.changed.map(c => (
            <tr key={`c-${c.itemId}`} className="bg-[var(--color-warning-soft)]">
              <td className="p-2 font-semibold text-[var(--color-warning)]">~</td>
              <td className="p-2">{c.changes.sku ? <><s>{c.changes.sku.from}</s> → <strong>{c.changes.sku.to}</strong></> : c.display.sku}</td>
              <td className="p-2">{c.changes.description ? <><s>{c.changes.description.from}</s> → <strong>{c.changes.description.to}</strong></> : c.display.description}</td>
              <td className="p-2 text-right tabular-nums">{c.changes.qty ? <>{c.changes.qty.from} → <strong>{c.changes.qty.to}</strong></> : "—"}</td>
              <td className="p-2 text-right tabular-nums">{c.changes.price ? <>${c.changes.price.from.toFixed(2)} → <strong>${c.changes.price.to.toFixed(2)}</strong></> : "—"}</td>
              <td className="p-2">{c.changes.vendor ? <>{c.changes.vendor.from ?? "—"} → <strong>{c.changes.vendor.to ?? "—"}</strong></> : "—"}</td>
              <td className="p-2">{c.changes.section ? <>{c.changes.section.from ?? "—"} → <strong>{c.changes.section.to ?? "—"}</strong></> : "—"}</td>
            </tr>
          ))}
          {diff.lines.removed.map(l => (
            <tr key={`r-${l.itemId}`} className="bg-[var(--color-danger-soft)]">
              <td className="p-2 font-semibold text-[var(--color-danger)]">−</td>
              <td className="p-2 line-through">{l.sku}</td>
              <td className="p-2 line-through">{l.description}</td>
              <td className="p-2 text-right tabular-nums line-through">{l.qty}</td>
              <td className="p-2 text-right tabular-nums line-through">${l.unitPrice.toFixed(2)}</td>
              <td className="p-2 line-through">{l.vendor ?? "—"}</td>
              <td className="p-2 line-through">{l.section ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
