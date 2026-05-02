"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useTweaks } from "@/stores/tweaks-store";
import { FilterPanel } from "./filter-panel";
import { FilterBar } from "./filter-bar";
import { SearchAddCombo, type CatalogItem } from "./search-add-combo";
import { SectionedLineTable, type Line } from "./sectioned-line-table";
import { SummaryBar } from "./summary-bar";
import { ColumnsMenu } from "./columns-menu";
import { LayoutToggle } from "./layout-toggle";
import { CsvImportDialog } from "./csv-import-dialog";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";
import type { SectionInfo } from "./section-row";

type Props = {
  projectId: string;
  projectCode: string;
  projectName: string;
  revisionId: string;
  vendors: { id: string; name: string }[];
  categories: { id: string; name: string; subcategories: { id: string; name: string }[] }[];
  catalog: CatalogItem[];
  vendorCounts: Record<string, number>;
  categoryCounts: Record<string, number>;
  stockCounts: Record<string, number>;
  lines: Line[];
  sections: SectionInfo[];
};

export function BuilderShell(p: Props) {
  const router = useRouter();
  const { layout } = useTweaks();
  const storageKey = `bom-builder-active-section:${p.revisionId}`;
  const [rawActiveSectionId, setActiveSectionId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return window.sessionStorage.getItem(storageKey);
    } catch {
      return null;
    }
  });

  // Derive: if the persisted/selected section no longer exists, ignore it.
  const activeSectionId = rawActiveSectionId && p.sections.some(s => s.id === rawActiveSectionId)
    ? rawActiveSectionId
    : null;

  // Persist whenever the effective active section changes.
  useEffect(() => {
    try {
      if (activeSectionId) window.sessionStorage.setItem(storageKey, activeSectionId);
      else window.sessionStorage.removeItem(storageKey);
    } catch {}
  }, [storageKey, activeSectionId]);

  // Map BOM lines back to catalog item ids via SKU lookup, so SearchAddCombo
  // can mark them as "In BOM".
  const lineCatalogIds = useMemo(() => {
    const skuSet = new Set(p.lines.map(l => l.sku));
    return new Set(p.catalog.filter(c => skuSet.has(c.sku)).map(c => c.id));
  }, [p.catalog, p.lines]);

  const totalUnits = p.lines.reduce((s, l) => s + l.qty, 0);
  const totalValue = p.lines.reduce((s, l) => s + l.qty * Number(l.unitPriceSnapshot), 0);
  const vendorCount = new Set(p.lines.map(l => l.vendorName).filter(Boolean)).size;

  return (
    <>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2.5 text-[20px] font-semibold tracking-tight">
            {p.projectName}
            <span className="rounded-full bg-[var(--color-surface-3)] px-2 py-px font-mono text-[11px] text-[var(--color-text-2)]">{p.projectCode}</span>
          </h1>
          <p className="text-[13px] text-[var(--color-text-3)]">Build the bill of materials by adding items from the catalog.</p>
        </div>
        <div className="flex items-center gap-2">
          <LayoutToggle />
          <Button variant="outline"><Icon.Copy size={14} className="mr-1.5" /> Duplicate</Button>
          <Button onClick={() => router.push(`/preview/${p.projectId}`)}><Icon.Eye size={14} className="mr-1.5" /> Preview</Button>
        </div>
      </div>

      <div className={layout === "stacked" ? "block" : "grid grid-cols-[248px_1fr] items-start gap-4"}>
        {layout === "stacked" ? (
          <FilterBar
            vendors={p.vendors}
            categories={p.categories}
            vendorCounts={p.vendorCounts}
            categoryCounts={p.categoryCounts}
            stockCounts={p.stockCounts}
          />
        ) : (
          <FilterPanel
            vendors={p.vendors}
            categories={p.categories}
            vendorCounts={p.vendorCounts}
            categoryCounts={p.categoryCounts}
            stockCounts={p.stockCounts}
          />
        )}

        <div className="overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]">
          <div className="flex gap-2 border-b border-[var(--color-line-soft)] bg-[var(--color-surface-2)] p-3.5">
            <SearchAddCombo
              revisionId={p.revisionId}
              catalog={p.catalog}
              lineItemIds={lineCatalogIds}
              activeSectionId={activeSectionId}
            />
            <CsvImportDialog revisionId={p.revisionId} />
            <ColumnsMenu />
          </div>
          <SectionedLineTable
            revisionId={p.revisionId}
            lines={p.lines}
            sections={p.sections}
            activeSectionId={activeSectionId}
            onActiveSectionChange={setActiveSectionId}
          />
          <SummaryBar lineCount={p.lines.length} totalUnits={totalUnits} vendors={vendorCount} totalValue={totalValue} />
        </div>
      </div>
    </>
  );
}
