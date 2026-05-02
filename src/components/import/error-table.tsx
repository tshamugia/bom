import type { RowError } from "@/lib/schemas/import";

export function ErrorTable({ rows }: { rows: RowError[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)]">
      <div className="border-b border-[var(--color-line-soft)] px-4 py-2.5 text-[12.5px] font-semibold">
        {rows.length} row{rows.length === 1 ? "" : "s"} with errors
      </div>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="bg-[var(--color-surface-2)] text-[11px] uppercase tracking-wider text-[var(--color-text-3)]">
            <th className="px-4 py-2 text-left font-medium">Row</th>
            <th className="px-4 py-2 text-left font-medium">SKU</th>
            <th className="px-4 py-2 text-left font-medium">Reason</th>
            <th className="px-4 py-2 text-left font-medium">Field</th>
            <th className="px-4 py-2 text-left font-medium">Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 200).map((e, i) => (
            <tr key={i} className="border-b border-[var(--color-line-soft)] last:border-0">
              <td className="px-4 py-1.5 tabular-nums">{e.rowNumber}</td>
              <td className="px-4 py-1.5 font-mono text-[11.5px]">{e.sku || "—"}</td>
              <td className="px-4 py-1.5">{e.reason}</td>
              <td className="px-4 py-1.5 text-[var(--color-text-3)]">{e.field ?? ""}</td>
              <td className="px-4 py-1.5 text-[var(--color-text-3)]">{e.value ?? ""}</td>
            </tr>
          ))}
          {rows.length > 200 && (
            <tr><td colSpan={5} className="px-4 py-2 text-[11.5px] text-[var(--color-text-3)]">…{rows.length - 200} more (download errors.xlsx after import to see all).</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
