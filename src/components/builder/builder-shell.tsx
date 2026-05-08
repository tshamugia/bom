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
import { DuplicateDialog } from "./duplicate-dialog";
import { RevisionHeader } from "@/components/revisions/revision-header";
import type { SwitcherBom } from "./bom-switcher";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";
import type { SectionInfo } from "./section-row";

type RevisionStatus = "draft" | "committed" | "in-progress" | "review" | "approved" | "locked";

type Props = {
  projectId: string;
  projectCode: string;
  projectName: string;
  bomId: string;
  bomName: string;
  revisionId: string;
  revision: {
    id: string;
    letter: string;
    status: RevisionStatus;
    ownerName: string | null;
    committedByName: string | null;
    committedAt: Date | null;
    commitMessage: string | null;
    parentLetter: string | null;
  };
  hasOpenDraft: boolean;
  vendors: { id: string; name: string }[];
  categories: { id: string; name: string; subcategories: { id: string; name: string }[] }[];
  catalog: CatalogItem[];
  vendorCounts: Record<string, number>;
  categoryCounts: Record<string, number>;
  lines: Line[];
  sections: SectionInfo[];
  projectsForDuplicate: { id: string; code: string; name: string }[];
  bomsInProject: SwitcherBom[];
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

  const activeSectionId = rawActiveSectionId && p.sections.some(s => s.id === rawActiveSectionId)
    ? rawActiveSectionId
    : null;

  useEffect(() => {
    try {
      if (activeSectionId) window.sessionStorage.setItem(storageKey, activeSectionId);
      else window.sessionStorage.removeItem(storageKey);
    } catch {}
  }, [storageKey, activeSectionId]);

  const lineCatalogIds = useMemo(() => {
    const skuSet = new Set(p.lines.map(l => l.sku));
    return new Set(p.catalog.filter(c => skuSet.has(c.sku)).map(c => c.id));
  }, [p.catalog, p.lines]);

  const totalUnits = p.lines.reduce((s, l) => s + l.qty, 0);
  const vendorCount = new Set(p.lines.map(l => l.vendorName).filter(Boolean)).size;
  const isDraft = p.revision.status === "draft";

  return (
    <>
      <RevisionHeader
        projectId={p.projectId}
        projectCode={p.projectCode}
        projectName={p.projectName}
        bomId={p.bomId}
        bomName={p.bomName}
        revision={p.revision}
        preflight={{
          lineCount: p.lines.length,
          vendorCount,
          hasZeroQty: p.lines.some(l => l.qty === 0),
        }}
        hasOpenDraft={p.hasOpenDraft}
        bomsInProject={p.bomsInProject}
      />
      <div className="mb-5 flex items-center justify-end gap-2">
        <LayoutToggle />
        <DuplicateDialog
          sourceBomId={p.bomId}
          sourceBomName={p.bomName}
          sourceProjectId={p.projectId}
          sourceRevisionId={p.revisionId}
          projects={p.projectsForDuplicate}
        />
        <Button onClick={() => router.push(`/preview/${p.projectId}/${p.bomId}`)}>
          <Icon.Eye size={14} className="mr-1.5" /> Preview
        </Button>
      </div>

      <div className={layout === "stacked" ? "block" : "grid grid-cols-[248px_1fr] items-start gap-4"}>
        {layout === "stacked" ? (
          <FilterBar
            vendors={p.vendors}
            categories={p.categories}
            vendorCounts={p.vendorCounts}
            categoryCounts={p.categoryCounts}
          />
        ) : (
          <FilterPanel
            vendors={p.vendors}
            categories={p.categories}
            vendorCounts={p.vendorCounts}
            categoryCounts={p.categoryCounts}
          />
        )}

        <div className="overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]">
          {isDraft && (
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
          )}
          <SectionedLineTable
            revisionId={p.revisionId}
            lines={p.lines}
            sections={p.sections}
            activeSectionId={activeSectionId}
            onActiveSectionChange={setActiveSectionId}
            readOnly={!isDraft}
          />
          <SummaryBar lineCount={p.lines.length} totalUnits={totalUnits} vendors={vendorCount} />
        </div>
      </div>
    </>
  );
}
