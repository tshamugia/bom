import { notFound } from "next/navigation";
import { inArray } from "drizzle-orm";
import { getProject, getActiveRevision, getLines, getSections, hasOpenDraftForProject } from "@/server/queries/projects";
import { listItems, listCategories } from "@/server/queries/catalog";
import { listVendors } from "@/server/queries/vendors";
import { db } from "@/db/client";
import { subcategories } from "@/db/schema";
import { BuilderShell } from "@/components/builder/builder-shell";
import type { Line } from "@/components/builder/sectioned-line-table";

export default async function BuilderPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;

  const [project, vendors, cats, catalog] = await Promise.all([
    getProject(projectId),
    listVendors(),
    listCategories(),
    listItems({}),
  ]);
  if (!project) notFound();

  const rev = await getActiveRevision(projectId);
  if (!rev) notFound();

  const [lines, sections, hasOpenDraft] = await Promise.all([
    getLines(rev.id),
    getSections(rev.id),
    hasOpenDraftForProject(projectId, rev.id),
  ]);

  // Pull subcategories grouped by category for the filter panel.
  const catIds = cats.map(c => c.id);
  const allSubs = catIds.length
    ? await db.select().from(subcategories).where(inArray(subcategories.categoryId, catIds))
    : [];
  const categories = cats.map(c => ({
    ...c,
    subcategories: allSubs.filter(s => s.categoryId === c.id).map(s => ({ id: s.id, name: s.name })),
  }));

  // Aggregations for filter counts.
  const vendorCounts: Record<string, number> = {};
  const categoryCounts: Record<string, number> = {};
  const stockCounts: Record<string, number> = {};
  for (const it of catalog) {
    if (it.vendorName) vendorCounts[it.vendorName] = (vendorCounts[it.vendorName] ?? 0) + 1;
    if (it.categoryName) categoryCounts[it.categoryName] = (categoryCounts[it.categoryName] ?? 0) + 1;
    stockCounts[it.stockState] = (stockCounts[it.stockState] ?? 0) + 1;
  }

  return (
    <BuilderShell
      projectId={project.id}
      projectCode={project.code}
      projectName={project.name}
      revisionId={rev.id}
      revision={{
        id: rev.id,
        letter: rev.letter,
        status: rev.status,
        ownerName: rev.ownerName ?? null,
        committedByName: rev.committedByName ?? null,
        committedAt: rev.committedAt ?? null,
        commitMessage: rev.commitMessage ?? null,
        parentLetter: rev.parentLetter ?? null,
      }}
      hasOpenDraft={hasOpenDraft}
      vendors={vendors.map(v => ({ id: v.id, name: v.name }))}
      categories={categories}
      catalog={catalog.map(c => ({
        id: c.id, sku: c.sku, description: c.description, manufacturer: c.manufacturer,
        unitPrice: c.unitPrice, vendorName: c.vendorName, categoryId: c.categoryId,
        subcategoryId: c.subcategoryId, stockState: c.stockState,
      }))}
      vendorCounts={vendorCounts}
      categoryCounts={categoryCounts}
      stockCounts={stockCounts}
      lines={lines as Line[]}
      sections={sections}
    />
  );
}
