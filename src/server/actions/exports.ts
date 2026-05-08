"use server";

import { z } from "zod";
import { asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { bomExports, bomLines, bomRevisions, bomSections, boms, projects, user } from "@/db/schema";
import { requireSession } from "../auth-context";
import { audit } from "../audit";
import { buildBomWorkbook, type BomRow } from "@/lib/excel";
import { putObject } from "@/lib/s3";

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

const Options = z.object({
  columns: Columns,
  groupByVendor: z.boolean(),
  includeCoverPage: z.boolean(),
});

export async function generateExport(input: { revisionId: string; options: z.infer<typeof Options> }) {
  const options = Options.parse(input.options);
  const session = await requireSession();

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
      projectQty: projects.quantity,
      projectTarget: projects.targetDate,
      ownerName: user.name,
    })
    .from(bomRevisions)
    .innerJoin(boms, eq(boms.id, bomRevisions.bomId))
    .innerJoin(projects, eq(projects.id, boms.projectId))
    .leftJoin(user, eq(user.id, projects.ownerId))
    .where(eq(bomRevisions.id, input.revisionId))
    .limit(1);
  if (!rev) throw new Error("REVISION_NOT_FOUND");

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

  const isDraft = rev.status === "draft";
  const draftSuffix = isDraft ? `_DRAFT_${new Date().toISOString().slice(0, 10)}` : "";

  const buf = await buildBomWorkbook({
    project: {
      code: rev.projectCode,
      name: rev.projectName,
      quantity: rev.projectQty,
      owner: rev.ownerName ?? session.user.name,
      target: rev.projectTarget ?? "—",
    },
    revisionLetter: rev.letter,
    rows,
    options,
    isDraft,
  });

  const fileName = `BOM_${rev.projectCode}_Rev_${rev.letter}${draftSuffix}.xlsx`;
  const fileKey = `exports/${rev.id}/${Date.now()}-${fileName}`;
  await putObject(fileKey, buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

  const [row] = await db.insert(bomExports).values({
    revisionId: rev.id,
    format: "xlsx",
    fileKey,
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
  return row;
}
