import { Badge } from "@/components/ui/badge";

type Item = {
  id: string;
  sku: string;
  stockState: "in-stock" | "low-stock" | "backorder" | "out-of-stock";
  onHand: number;
  unit: string;
};

export function StockAlerts({ items }: { items: Item[] }) {
  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]">
      <div className="border-b border-[var(--color-line-soft)] px-4 py-3">
        <h3 className="text-[13.5px] font-semibold">Stock alerts</h3>
      </div>
      <div className="py-1">
        {items.length === 0 && <div className="px-4 py-3 text-[12.5px] text-[var(--color-text-3)]">All items are in stock.</div>}
        {items.map(i => {
          const tone = i.stockState === "backorder" || i.stockState === "out-of-stock" ? "danger" : "warning";
          const label = i.stockState === "backorder" ? "Backorder" : i.stockState === "out-of-stock" ? "Out" : "Low";
          return (
            <div key={i.id} className="flex items-center gap-2.5 border-b border-[var(--color-line-soft)] px-4 py-2.5 text-[12.5px] last:border-0">
              <Badge tone={tone}>{label}</Badge>
              <span className="font-mono text-[11.5px]">{i.sku}</span>
              <span className="ml-auto text-[var(--color-text-3)] tabular-nums">{i.onHand} {i.unit}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
