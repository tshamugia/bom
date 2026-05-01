export function SummaryCard({ lines, totalUnits, vendors, subtotal, tax, grand }: {
  lines: number; totalUnits: number; vendors: number; subtotal: number; tax: number; grand: number;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]">
      <div className="border-b border-[var(--color-line-soft)] px-4 py-3">
        <h3 className="text-[13.5px] font-semibold">Summary</h3>
      </div>
      <dl className="grid grid-cols-[130px_1fr] gap-y-2 gap-x-4 p-4 text-[12.5px]">
        <Term k="Lines" v={lines} />
        <Term k="Total units" v={totalUnits.toLocaleString()} />
        <Term k="Vendors" v={vendors} />
        <Term k="Subtotal" v={`$${subtotal.toFixed(2)}`} />
        <Term k="Tax" v={`$${tax.toFixed(2)}`} />
        <Term k="Grand total" v={`$${grand.toFixed(2)}`} bold />
      </dl>
    </div>
  );
}
function Term({ k, v, bold }: { k: string; v: string | number; bold?: boolean }) {
  return (
    <>
      <dt className={`text-[var(--color-text-3)] ${bold ? "font-semibold text-[var(--color-text)]" : ""}`}>{k}</dt>
      <dd className={`m-0 tabular-nums ${bold ? "font-semibold" : ""}`}>{v}</dd>
    </>
  );
}
