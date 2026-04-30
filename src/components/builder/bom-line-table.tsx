"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";
import { useTweaks } from "@/stores/tweaks-store";
import { StockBadge } from "@/components/master/status-badge";
import { updateLineQty, removeLine } from "@/server/actions/bom-lines";

export type Line = {
  id: string;
  sku: string;
  description: string;
  manufacturer: string;
  unit: string;
  qty: number;
  unitPriceSnapshot: string;
  vendorName: string | null;
  subcategoryName: string | null;
  categoryName: string | null;
  stockState: "in-stock" | "low-stock" | "backorder" | "out-of-stock";
};

export function BomLineTable({ lines }: { lines: Line[] }) {
  const { columns } = useTweaks();
  const [, start] = useTransition();
  const [drafts, setDrafts] = useState<Record<string, number>>({});

  if (lines.length === 0) {
    return (
      <div className="px-6 py-16 text-center text-[var(--color-text-3)]">
        <div className="text-[13.5px]">No items in this BOM yet</div>
        <div className="mt-1 text-[12px]">Use the search above or filters at left to add components.</div>
      </div>
    );
  }

  return (
    <div className="overflow-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-[var(--color-line)] bg-[var(--color-surface)] text-[11px] uppercase tracking-wider text-[var(--color-text-3)]">
            <Th w={32}>#</Th>
            {columns.sku    && <Th>SKU / Part #</Th>}
            {columns.desc   && <Th>Description</Th>}
            {columns.cat    && <Th>Category</Th>}
            {columns.vendor && <Th>Vendor</Th>}
            {columns.unit   && <Th>Unit</Th>}
            {columns.qty    && <Th align="right">Qty</Th>}
            {columns.price  && <Th align="right">Unit price</Th>}
            {columns.total  && <Th align="right">Total</Th>}
            {columns.stock  && <Th>Stock</Th>}
            <Th w={32} />
          </tr>
        </thead>
        <tbody>
          {lines.map((it, i) => {
            const qty = drafts[it.id] ?? it.qty;
            const price = Number(it.unitPriceSnapshot);
            return (
              <tr key={it.id} className="group border-b border-[var(--color-line-soft)] last:border-0 hover:bg-[var(--color-surface-2)]">
                <td className="px-3 py-2 text-[11px] tabular-nums text-[var(--color-text-3)]">{String(i + 1).padStart(2, "0")}</td>
                {columns.sku    && <td className="px-3 py-2 font-mono text-[11.5px]">{it.sku}</td>}
                {columns.desc   && <td className="px-3 py-2">{it.description}<div className="text-[11px] text-[var(--color-text-3)]">{it.manufacturer}</div></td>}
                {columns.cat    && <td className="px-3 py-2 text-[var(--color-text-3)]">{it.subcategoryName ?? it.categoryName ?? "—"}</td>}
                {columns.vendor && <td className="px-3 py-2">{it.vendorName ?? "—"}</td>}
                {columns.unit   && <td className="px-3 py-2 text-[var(--color-text-3)]">{it.unit}</td>}
                {columns.qty    && (
                  <td className="px-3 py-2 text-right">
                    <Input
                      className="h-7 w-16 text-right font-mono text-[12px] tabular-nums"
                      type="number" min={0} value={qty}
                      onChange={e => setDrafts(d => ({ ...d, [it.id]: Math.max(0, Number(e.target.value) || 0) }))}
                      onBlur={() => {
                        if (qty === it.qty) return;
                        start(async () => { await updateLineQty({ id: it.id, qty }); });
                      }}
                    />
                  </td>
                )}
                {columns.price && <td className="px-3 py-2 text-right tabular-nums">${price.toFixed(3)}</td>}
                {columns.total && <td className="px-3 py-2 text-right font-medium tabular-nums">${(qty * price).toFixed(2)}</td>}
                {columns.stock && <td className="px-3 py-2"><StockBadge state={it.stockState} /></td>}
                <td className="px-3 py-2 text-right">
                  <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100"
                          onClick={() => start(async () => { await removeLine({ id: it.id }); })}>
                    <Icon.Trash size={14} />
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, w, align = "left" }: { children?: React.ReactNode; w?: number; align?: "left" | "right" }) {
  return (
    <th className={`px-3 py-2 text-${align} font-medium`} style={w ? { width: w } : undefined}>{children}</th>
  );
}
