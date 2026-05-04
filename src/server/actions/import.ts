"use server";

import ExcelJS from "exceljs";
import { createId } from "@paralleldrive/cuid2";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { items, vendors, categories, subcategories } from "@/db/schema";
import { audit } from "@/server/audit";
import {
  putObject,
  presignDownload,
  deleteObject,
  stagingKey,
  errorsKey,
  getStagingBuffer,
} from "@/lib/s3";
import { getCurrentOrgId, requireSession } from "@/server/org";
import { parseImportBuffer } from "@/server/lib/import-parser";
import { validateRows } from "@/server/lib/import-validator";
import { loadValidatorContext } from "@/server/lib/import-validator-context";
import {
  DuplicatePolicy,
  TEMPLATE_COLUMNS,
  type CommitResult,
  type PrepareResult,
  type RowError,
} from "@/lib/schemas/import";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

export async function prepareImport(formData: FormData): Promise<PrepareResult> {
  await requireSession();
  const orgId = await getCurrentOrgId();

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "unreadable" };
  if (file.size > MAX_FILE_BYTES) return { ok: false, error: "too_large" };

  const buf = Buffer.from(await file.arrayBuffer());
  const importId = createId();
  const key = stagingKey(orgId, importId);
  await putObject(key, buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

  const parsed = await parseImportBuffer(buf);
  if (!parsed.ok && parsed.error === "header_mismatch") {
    return { ok: false, error: "header_mismatch", expected: parsed.expected, found: parsed.found };
  }
  if (!parsed.ok) return { ok: false, error: "unreadable" };

  const ctx = await loadValidatorContext(orgId);
  const result = validateRows(
    { importId, fileName: file.name, rows: parsed.rows, parserErrors: parsed.rowErrors },
    ctx,
  );
  return { ok: true, result };
}

export async function commitImport(input: { importId: string; duplicates: DuplicatePolicy }): Promise<CommitResult> {
  await requireSession();
  const orgId = await getCurrentOrgId();
  const policy = DuplicatePolicy.parse(input.duplicates);

  const key = stagingKey(orgId, input.importId);
  const buf = await getStagingBuffer(key);
  if (!buf) return { ok: false, error: "expired" };

  const parsed = await parseImportBuffer(buf);
  if (!parsed.ok && parsed.error === "header_mismatch") return { ok: false, error: "header_mismatch" };
  if (!parsed.ok) return { ok: false, error: "unreadable" };

  const ctx = await loadValidatorContext(orgId);
  const dry = validateRows(
    { importId: input.importId, fileName: `${input.importId}.xlsx`, rows: parsed.rows, parserErrors: parsed.rowErrors },
    ctx,
  );

  let added = 0;
  let updated = 0;
  let skipped = 0;
  let vendorsCreated = 0;
  let categoriesCreated = 0;
  let subcategoriesCreated = 0;

  try {
    await db.transaction(async (tx) => {
      const vendorIdByCode = new Map<string, string>();
      const existingVs = await tx.select({ id: vendors.id, code: vendors.code }).from(vendors).where(eq(vendors.organizationId, orgId));
      for (const v of existingVs) vendorIdByCode.set(v.code, v.id);

      for (const code of dry.newVendors) {
        const [row] = await tx.insert(vendors).values({
          organizationId: orgId,
          name: code,
          code,
          country: "",
          leadTime: "",
          rating: 0,
          status: "approved",
        }).returning({ id: vendors.id, code: vendors.code });
        vendorIdByCode.set(row.code, row.id);
        vendorsCreated += 1;
      }

      const catIdByName = new Map<string, string>();
      const existingCs = await tx.select({ id: categories.id, name: categories.name }).from(categories).where(eq(categories.organizationId, orgId));
      for (const c of existingCs) catIdByName.set(c.name, c.id);

      for (const name of dry.newCategories) {
        const [row] = await tx.insert(categories).values({ organizationId: orgId, name }).returning({ id: categories.id, name: categories.name });
        catIdByName.set(row.name, row.id);
        categoriesCreated += 1;
      }

      const subIdByPair = new Map<string, string>();
      const catIds = [...catIdByName.values()];
      const existingSubs = catIds.length > 0
        ? await tx.select({
            id: subcategories.id,
            name: subcategories.name,
            categoryId: subcategories.categoryId,
          }).from(subcategories).where(inArray(subcategories.categoryId, catIds))
        : [];
      const catNameById = new Map<string, string>();
      for (const [name, id] of catIdByName) catNameById.set(id, name);
      for (const s of existingSubs) subIdByPair.set(`${catNameById.get(s.categoryId)}::${s.name}`, s.id);

      for (const pair of dry.newSubcategories) {
        const catId = catIdByName.get(pair.category)!;
        const [row] = await tx.insert(subcategories).values({ name: pair.subcategory, categoryId: catId }).returning({ id: subcategories.id, name: subcategories.name });
        subIdByPair.set(`${pair.category}::${row.name}`, row.id);
        subcategoriesCreated += 1;
      }

      const skusInDb = new Set(
        (await tx.select({ sku: items.sku }).from(items).where(eq(items.organizationId, orgId))).map(r => r.sku),
      );

      for (const r of parsed.rows) {
        const vendorId = r.vendorCode ? vendorIdByCode.get(r.vendorCode) ?? null : null;
        const categoryId = r.category ? catIdByName.get(r.category) ?? null : null;
        const subcategoryId = r.category && r.subcategory ? subIdByPair.get(`${r.category}::${r.subcategory}`) ?? null : null;

        const exists = skusInDb.has(r.sku);
        if (exists && policy === "skip") { skipped += 1; continue; }

        if (exists) {
          await tx.update(items).set({
            description: r.description,
            manufacturer: r.manufacturer,
            unit: r.unit,
            vendorId,
            categoryId,
            subcategoryId,
            updatedAt: new Date(),
          }).where(and(eq(items.organizationId, orgId), eq(items.sku, r.sku)));
          updated += 1;
        } else {
          await tx.insert(items).values({
            organizationId: orgId,
            sku: r.sku,
            description: r.description,
            manufacturer: r.manufacturer,
            unit: r.unit,
            vendorId,
            categoryId,
            subcategoryId,
          });
          added += 1;
        }
      }
    });
  } catch (e) {
    return { ok: false, error: "db_error", message: e instanceof Error ? e.message : String(e) };
  }

  let errorsFileUrl: string | null = null;
  if (dry.errorRows.length > 0) {
    const errBuf = await buildErrorsWorkbook(buf, dry.errorRows);
    const eKey = errorsKey(orgId, input.importId);
    await putObject(eKey, errBuf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    errorsFileUrl = await presignDownload(eKey, 60 * 60);
  }

  await audit({
    kind: "catalog.imported",
    summary: `Imported ${added} items (${updated} updated, ${dry.errorRows.length} errors)`,
    payload: {
      fileName: `${input.importId}.xlsx`,
      counts: { added, updated, skipped, errored: dry.errorRows.length },
      autoCreated: { vendors: vendorsCreated, categories: categoriesCreated, subcategories: subcategoriesCreated },
      errorsFileUrl,
    },
  });

  await deleteObject(key);

  return {
    ok: true,
    counts: { added, updated, skipped, errored: dry.errorRows.length },
    vendorsCreated,
    categoriesCreated,
    subcategoriesCreated,
    errorsFileUrl,
  };
}

async function buildErrorsWorkbook(originalBuf: Buffer, errs: RowError[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(originalBuf as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  const errCol = TEMPLATE_COLUMNS.length + 1;
  ws.getRow(1).getCell(errCol).value = "error";
  const byRow = new Map(errs.map(e => [e.rowNumber, e]));
  for (let r = 2; r <= ws.actualRowCount; r++) {
    const e = byRow.get(r);
    if (e) ws.getRow(r).getCell(errCol).value = `${e.reason}${e.field ? ` (${e.field})` : ""}`;
  }
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
