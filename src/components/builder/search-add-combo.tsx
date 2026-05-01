"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useBuilder } from "@/stores/builder-store";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";
import { addLine } from "@/server/actions/bom-lines";

export type CatalogItem = {
  id: string; sku: string; description: string; manufacturer: string;
  unitPrice: string; vendorName: string | null; categoryId: string | null;
  subcategoryId: string | null; stockState: string;
};

export function SearchAddCombo({
  revisionId, catalog, lineItemIds,
}: { revisionId: string; catalog: CatalogItem[]; lineItemIds: Set<string> }) {
  const s = useBuilder();
  const ref = useRef<HTMLDivElement>(null);
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) s.setComboOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [s]);

  const filtered = useMemo(() => {
    const q = s.search.trim().toLowerCase();
    return catalog.filter(it => {
      if (s.vendorFilter.size && !(it.vendorName && s.vendorFilter.has(it.vendorName))) return false;
      if (s.categoryFilter.size && !(it.categoryId && s.categoryFilter.has(it.categoryId))) return false;
      if (s.subcategoryFilter.size && !(it.subcategoryId && s.subcategoryFilter.has(it.subcategoryId))) return false;
      if (s.stockFilter.size && !s.stockFilter.has(it.stockState)) return false;
      if (q && !(it.sku.toLowerCase().includes(q) || it.description.toLowerCase().includes(q) || it.manufacturer.toLowerCase().includes(q))) return false;
      return true;
    }).slice(0, 80);
  }, [catalog, s.search, s.vendorFilter, s.categoryFilter, s.subcategoryFilter, s.stockFilter]);

  function add(itemId: string) {
    setAdding(itemId);
    start(async () => {
      await addLine({ revisionId, itemId });
      setAdding(null);
      useBuilder.setState({ search: "", comboOpen: false });
    });
  }

  return (
    <div ref={ref} className="relative flex-1">
      <Icon.Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-4)]" />
      <Input
        className="pl-9"
        placeholder="Search SKU, description, or manufacturer to add to BOM…"
        value={s.search}
        onChange={e => s.setSearch(e.target.value)}
        onFocus={() => s.setComboOpen(true)}
      />
      {s.comboOpen && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-[360px] overflow-auto rounded-lg border border-[var(--color-line-strong)] bg-[var(--color-surface)] shadow-[var(--shadow-pop)]">
          {filtered.length === 0 && (
            <div className="p-4 text-center text-[12.5px] text-[var(--color-text-3)]">No items match the current filters.</div>
          )}
          {filtered.map(it => {
            const inBom = lineItemIds.has(it.id);
            return (
              <div
                key={it.id}
                className="grid cursor-pointer grid-cols-[130px_1fr_auto_auto] items-center gap-2.5 border-b border-[var(--color-line-soft)] px-3 py-2 text-[12.5px] last:border-0 hover:bg-[var(--color-accent-soft)]"
                onClick={() => !inBom && add(it.id)}
              >
                <span className="font-mono text-[11.5px]">{it.sku}</span>
                <span className="truncate text-[var(--color-text-2)]">{it.description}</span>
                <span className="tabular-nums text-[var(--color-text-2)]">${Number(it.unitPrice).toFixed(3)}</span>
                {inBom ? (
                  <span className="rounded-full bg-[var(--color-success-soft)] px-2 py-px text-[11px] text-[var(--color-success)]">In BOM</span>
                ) : (
                  <Button variant="ghost" size="sm" disabled={pending && adding === it.id}><Icon.Plus size={14} /></Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
