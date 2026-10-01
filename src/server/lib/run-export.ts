import "server-only";
import { z } from "zod";
import { asc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import {
  bomExports, bomLines, bomRevisionDrawings, bomRevisions, bomSections, boms, drawingRevisions, drawings, projects, user,
} from "@/db/schema";
import { formatDrawingRevision } from "@/lib/drawing-status";
import { EDITOR_ROLES } from "@/lib/roles";
import { requireRole, requireSession } from "../auth-context";
import { audit } from "../audit";
import { buildBomWorkbook, type BomRow } from "@/lib/excel";

const Columns = z
  .object({
    sku: z.boolean(),
    description: z.boolean(),
    manufacturer: z.boolean(),
    vendor: z.boolean(),
    unit: z.boolean(),
    qty: z.boolean(),
  })
  .refine(c => c.sku && c.qty, { message: "SKU and Qty columns are required" });

export const ExportOptions = z.object({
  columns: Columns,
  groupByVendor: z.boolean(),
  includeCoverPage: z.boolean(),
});

export type ExportOptionsT = z.infer<typeof ExportOptions>;

export const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type RunExportResult = {
  row: typeof bomExports.$inferSelect;
  buffer: Buffer;
  fileName: string;
  projectId: string;
  bomId: string;
  revisionLetter: string;
  projectCode: string;
  projectName: string;
  bomName: string;
};

async function loadRevision(revisionId: string) {
  const [rev] = await db
    .select({
      id: bomRevisions.id,
      letter: bomRevisions.letter,
      status: bomRevisions.status,
      bomId: bomRevisions.bomId,
      bomName: boms.name,
      projectId: boms.projectId,
      projectCode: projects.code,
      projectName: projects.name,
      projectTarget: projects.targetDate,
      ownerName: user.name,
    })
    .from(bomRevisions)
    .innerJoin(boms, eq(boms.id, bomRevisions.bomId))
    .innerJoin(projects, eq(projects.id, boms.projectId))
    .leftJoin(user, eq(user.id, projects.ownerId))
    .where(eq(bomRevisions.id, revisionId))
    .limit(1);
  return rev ?? null;
}

type LoadedRevision = NonNullable<Awaited<ReturnType<typeof loadRevision>>>;

/** Builds the workbook from the revision's current lines — nothing is stored. */
async function buildRevisionWorkbook(
  rev: LoadedRevision,
  options: ExportOptionsT,
  isDraft: boolean,
  ownerFallback: string,
): Promise<Buffer> {
  const lines = await db
    .select({
      sku: bomLines.skuSnapshot,
      description: bomLines.descriptionSnapshot,
      manufacturer: bomLines.manufacturerSnapshot,
      unit: bomLines.unitSnapshot,
      qty: bomLines.qty,
      vendorName: bomLines.vendorNameSnapshot,
      position: bomLines.position,
      sectionName: bomSections.name,
      sectionPosition: bomSections.position,
    })
    .from(bomLines)
    .leftJoin(bomSections, eq(bomSections.id, bomLines.sectionId))
    .where(eq(bomLines.revisionId, rev.id))
    .orderBy(sql`${bomSections.position} ASC NULLS FIRST`, asc(bomLines.position));

  const rows: BomRow[] = lines.map(l => ({
    sku: l.sku,
    description: l.description,
    manufacturer: l.manufacturer ?? "",
    vendor: l.vendorName,
    unit: l.unit,
    qty: l.qty,
    sectionName: l.sectionName,
    sectionPosition: l.sectionPosition,
  }));

  const checked = alias(drawingRevisions, "checked_rev");
  const drawingRefs = await db
    .select({ code: drawings.code, number: drawingRevisions.number, checkedNumber: checked.number })
    .from(bomRevisionDrawings)
    .innerJoin(drawings, eq(drawings.id, bomRevisionDrawings.drawingId))
    .innerJoin(drawingRevisions, eq(drawingRevisions.id, bomRevisionDrawings.drawingRevisionId))
    .leftJoin(checked, eq(checked.id, bomRevisionDrawings.checkedRevisionId))
    .where(eq(bomRevisionDrawings.bomRevisionId, rev.id))
    .orderBy(asc(drawings.code));

  return buildBomWorkbook({
    project: {
      code: rev.projectCode,
      name: rev.projectName,
      owner: rev.ownerName ?? ownerFallback,
      target: rev.projectTarget ?? "—",
    },
    revisionLetter: rev.letter,
    rows,
    options,
    isDraft,
    referenceDrawings: drawingRefs.map(d =>
      `${d.code} ${formatDrawingRevision(d.number)}${d.checkedNumber ? ` (checked ${formatDrawingRevision(d.checkedNumber)})` : ""}`,
    ),
  });
}

export async function runExport(input: { revisionId: string; options: ExportOptionsT }): Promise<RunExportResult> {
  const options = ExportOptions.parse(input.options);
  const session = await requireRole(...EDITOR_ROLES);

  const rev = await loadRevision(input.revisionId);
  if (!rev) throw new Error("REVISION_NOT_FOUND");

  const isDraft = rev.status === "draft";
  const draftSuffix = isDraft ? `_DRAFT_${new Date().toISOString().slice(0, 10)}` : "";
  const buf = await buildRevisionWorkbook(rev, options, isDraft, session.user.name);
  const fileName = `BOM_${rev.projectCode}_Rev_${rev.letter}${draftSuffix}.xlsx`;

  const [row] = await db.insert(bomExports).values({
    revisionId: rev.id,
    format: "xlsx",
    fileName,
    byteSize: buf.length,
    options,
    status: "exported",
    revisionStatusAtExport: rev.status,
    generatedById: session.user.id,
  }).returning();

  revalidatePath("/history");
  revalidatePath(`/preview/${rev.projectId}/${rev.bomId}`);
  await audit({
    kind: "bom.export.generated",
    refType: "export", refId: row.id,
    summary: `${row.fileName} exported`,
    payload: { revisionId: rev.id, byteSize: row.byteSize },
  });

  return {
    row,
    buffer: buf,
    fileName,
    projectId: rev.projectId,
    bomId: rev.bomId,
    revisionLetter: rev.letter,
    projectCode: rev.projectCode,
    projectName: rev.projectName,
    bomName: rev.bomName,
  };
}

/**
 * Rebuilds a recorded export for download. Locked/committed revisions are
 * immutable, so the file matches the original; a draft export reflects the
 * draft as it is now.
 */
export async function renderExportFile(exportId: string): Promise<{ fileName: string; buffer: Buffer } | null> {
  await requireSession();
  const [ex] = await db
    .select({
      revisionId: bomExports.revisionId,
      fileName: bomExports.fileName,
      options: bomExports.options,
      revisionStatusAtExport: bomExports.revisionStatusAtExport,
      generatedByName: user.name,
    })
    .from(bomExports)
    .leftJoin(user, eq(user.id, bomExports.generatedById))
    .where(eq(bomExports.id, exportId))
    .limit(1);
  if (!ex) return null;

  const rev = await loadRevision(ex.revisionId);
  if (!rev) return null;

  const buffer = await buildRevisionWorkbook(
    rev,
    ExportOptions.parse(ex.options),
    ex.revisionStatusAtExport === "draft",
    ex.generatedByName ?? "—",
  );
  return { fileName: ex.fileName, buffer };
}
