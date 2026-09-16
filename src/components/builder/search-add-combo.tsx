"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useBuilder } from "@/stores/builder-store";
import { Icon } from "@/components/icons";
import { addLine } from "@/server/actions/bom-lines";

export type CatalogItem = {
  id: string; sku: string; description: string; manufacturer: string;
  vendorName: string | null; categoryId: string | null;
  subcategoryId: string | null;
};

export function SearchAddCombo({
  revisionId, catalog, lineItemIds, activeSectionId,
}: { revisionId: string; catalog: CatalogItem[]; lineItemIds: Set<string>; activeSectionId?: string | null }) {
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
      if (q && !(it.sku.toLowerCase().includes(q) || it.description.toLowerCase().includes(q) || it.manufacturer.toLowerCase().includes(q))) return false;
      return true;
    }).slice(0, 80);
  }, [catalog, s.search, s.vendorFilter, s.categoryFilter, s.subcategoryFilter]);

  function add(itemId: string) {
    setAdding(itemId);
    start(async () => {
      await addLine({ revisionId, itemId, sectionId: activeSectionId ?? null });
      setAdding(null);
      useBuilder.setState({ search: "", comboOpen: false });
    });
  }

  return (
    <div ref={ref} className="search-combo">
      <Icon.Search className="ico" />
      <input
        className="input"
        placeholder="Search SKU, description, or manufacturer to add to BOM…"
        value={s.search}
        onChange={e => s.setSearch(e.target.value)}
        onFocus={() => s.setComboOpen(true)}
      />
      {s.comboOpen && (
        <div className="dropdown">
          {filtered.length === 0 && (
            <div className="dropdown-empty">No items match the current filters.</div>
          )}
          {filtered.map(it => {
            const inBom = lineItemIds.has(it.id);
            return (
              <div
                key={it.id}
                className="dropdown-row"
                style={{ gridTemplateColumns: "130px 1fr auto" }}
                onClick={() => !inBom && add(it.id)}
              >
                <span className="mono" style={{ fontSize: 11.5 }}>{it.sku}</span>
                <span className="desc">{it.description}</span>
                {inBom ? (
                  <span className="badge b-green"><Icon.Check className="ico" /> In BOM</span>
                ) : (
                  <button className="btn btn-sm btn-ghost" disabled={pending && adding === it.id}><Icon.Plus className="ico" /></button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
