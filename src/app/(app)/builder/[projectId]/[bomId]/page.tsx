import { notFound } from "next/navigation";
import { inArray } from "drizzle-orm";
import { getActiveRevision, getLines, getSections, hasOpenDraftForBom } from "@/server/queries/projects";
import { getBom, listBomsByProject, listProjectsForPicker } from "@/server/queries/boms";
import { listItems, listCategories } from "@/server/queries/catalog";
import { listVendors } from "@/server/queries/vendors";
import { db } from "@/db/client";
import { subcategories } from "@/db/schema";
import { BuilderShell } from "@/components/builder/builder-shell";
import type { Line } from "@/components/builder/sectioned-line-table";

export default async function BuilderPage({ params }: { params: Promise<{ projectId: string; bomId: string }> }) {
  const { projectId, bomId } = await params;

  const [bom, vendors, cats, catalog, projectsForDuplicate, bomsInProject] = await Promise.all([
    getBom(bomId),
    listVendors(),
    listCategories(),
    listItems({}),
    listProjectsForPicker(),
    listBomsByProject(projectId),
  ]);
  if (!bom || bom.projectId !== projectId) notFound();

  const rev = await getActiveRevision(bomId);
  if (!rev) notFound();

  const [lines, sections, hasOpenDraft] = await Promise.all([
    getLines(rev.id),
    getSections(rev.id),
    hasOpenDraftForBom(bomId, rev.id),
  ]);

  const catIds = cats.map(c => c.id);
  const allSubs = catIds.length
    ? await db.select().from(subcategories).where(inArray(subcategories.categoryId, catIds))
    : [];
  const categories = cats.map(c => ({
    ...c,
    subcategories: allSubs.filter(s => s.categoryId === c.id).map(s => ({ id: s.id, name: s.name })),
  }));

  const vendorCounts: Record<string, number> = {};
  const categoryCounts: Record<string, number> = {};
  for (const it of catalog) {
    if (it.vendorName) vendorCounts[it.vendorName] = (vendorCounts[it.vendorName] ?? 0) + 1;
    if (it.categoryName) categoryCounts[it.categoryName] = (categoryCounts[it.categoryName] ?? 0) + 1;
  }

  return (
    <BuilderShell
      projectId={bom.projectId}
      projectCode={bom.projectCode}
      projectName={bom.projectName}
      bomId={bom.id}
      bomName={bom.name}
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
        vendorName: c.vendorName, categoryId: c.categoryId,
        subcategoryId: c.subcategoryId,
      }))}
      vendorCounts={vendorCounts}
      categoryCounts={categoryCounts}
      lines={lines as Line[]}
      sections={sections}
      projectsForDuplicate={projectsForDuplicate}
      bomsInProject={bomsInProject.map(b => ({
        id: b.id,
        name: b.name,
        activeRevisionLetter: b.activeRevisionLetter,
      }))}
    />
  );
}
