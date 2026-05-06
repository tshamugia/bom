import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { items, categories, subcategories, vendors } from "@/db/schema";
import { requireSession } from "@/server/auth-context";
import { audit } from "@/server/audit";
import { buildCatalogWorkbook, type CatalogExportRow } from "@/lib/excel";
import { putObject, presignDownload } from "@/lib/s3";

export async function GET() {
  try {
    await requireSession();
  } catch {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const rows = await db
    .select({
      sku: items.sku,
      description: items.description,
      manufacturer: items.manufacturer,
      unit: items.unit,
      vendor: vendors.name,
      category: categories.name,
      subcategory: subcategories.name,
    })
    .from(items)
    .leftJoin(vendors, eq(vendors.id, items.vendorId))
    .leftJoin(categories, eq(categories.id, items.categoryId))
    .leftJoin(subcategories, eq(subcategories.id, items.subcategoryId))
    .orderBy(items.sku);

  const buf = await buildCatalogWorkbook(rows as CatalogExportRow[]);
  const fileName = `Catalog_${new Date().toISOString().slice(0, 10)}.xlsx`;
  const fileKey = `exports/catalog/${Date.now()}-${fileName}`;
  await putObject(fileKey, buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

  await audit({
    kind: "catalog.exported",
    refType: "catalog",
    summary: `${fileName} exported (${rows.length} items)`,
    payload: { itemsCount: rows.length, byteSize: buf.length },
  });

  const url = await presignDownload(fileKey, 60 * 5);
  return NextResponse.redirect(url);
}
