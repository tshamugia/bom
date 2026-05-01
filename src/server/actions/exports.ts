"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { bomExports, bomLines, bomRevisions, items, projects, vendors, user } from "@/db/schema";
import { getCurrentOrgId, requireSession } from "../org";
import { audit } from "../audit";
import { buildBomWorkbook, type BomRow } from "@/lib/excel";
import { putObject } from "@/lib/s3";

const Options = z.object({
  includeVendorPricing: z.boolean(),
  includeStockAvailability: z.boolean(),
  groupByVendor: z.boolean(),
  includeCoverPage: z.boolean(),
});

export async function generateExport(input: { revisionId: string; options: z.infer<typeof Options> }) {
  const options = Options.parse(input.options);
  const orgId = await getCurrentOrgId();
  const session = await requireSession();

  const [rev] = await db
    .select({
      id: bomRevisions.id,
      letter: bomRevisions.letter,
      projectId: bomRevisions.projectId,
      projectCode: projects.code,
      projectName: projects.name,
      projectQty: projects.quantity,
      projectTarget: projects.targetDate,
      ownerName: user.name,
    })
    .from(bomRevisions)
    .innerJoin(projects, eq(projects.id, bomRevisions.projectId))
    .leftJoin(user, eq(user.id, projects.ownerId))
    .where(and(eq(bomRevisions.id, input.revisionId), eq(projects.organizationId, orgId)))
    .limit(1);
  if (!rev) throw new Error("REVISION_NOT_FOUND");

  const lines = await db
    .select({
      sku: items.sku, description: items.description, manufacturer: items.manufacturer,
      unit: items.unit, qty: bomLines.qty, unitPriceSnapshot: bomLines.unitPriceSnapshot,
      vendorName: vendors.name, stockState: items.stockState, position: bomLines.position,
    })
    .from(bomLines)
    .innerJoin(items, eq(items.id, bomLines.itemId))
    .leftJoin(vendors, eq(vendors.id, items.vendorId))
    .where(eq(bomLines.revisionId, rev.id))
    .orderBy(bomLines.position);

  const rows: BomRow[] = lines.map(l => ({
    sku: l.sku, description: l.description, manufacturer: l.manufacturer,
    vendor: l.vendorName, unit: l.unit, qty: l.qty, unitPrice: Number(l.unitPriceSnapshot),
    stock: l.stockState,
  }));

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
  });

  const fileName = `BOM_${rev.projectCode}_Rev_${rev.letter}.xlsx`;
  const fileKey = `${orgId}/exports/${rev.id}/${Date.now()}-${fileName}`;
  await putObject(fileKey, buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

  const [row] = await db.insert(bomExports).values({
    revisionId: rev.id,
    format: "xlsx",
    fileKey,
    fileName,
    byteSize: buf.length,
    options,
    status: "exported",
    generatedById: session.user.id,
  }).returning();

  revalidatePath("/history");
  revalidatePath(`/preview/${rev.projectId}`);
  await audit({
    kind: "bom.export.generated",
    refType: "export", refId: row.id,
    summary: `${row.fileName} exported`,
    payload: { revisionId: rev.id, byteSize: row.byteSize },
  });
  return row;
}
