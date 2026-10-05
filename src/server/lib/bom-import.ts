import "server-only";
import ExcelJS from "exceljs";
import {
  BOM_IMPORT_COLUMNS,
  BOM_IMPORT_MAX_LINES,
  SECTION_NAME_MAX,
  SKU_MAX,
  type BomImportError,
  type BomImportRow,
  type BomImportSummary,
} from "@/lib/schemas/bom-import";
import type { ParsedRow, ValidatorContext } from "@/lib/schemas/import";
import { readCell } from "./import-parser";
import { validateRows } from "./import-validator";

export type BomParseResult =
  | { ok: true; rows: BomImportRow[]; errors: BomImportError[] }
  | { ok: false; error: "header_mismatch"; expected: string[]; found: string[] }
  | { ok: false; error: "unreadable" | "empty" | "too_many_lines" };

export type BomImportContext = ValidatorContext & {
  /** Set when importing into an existing draft: its section names (see `sectionKey`) and SKUs. */
  target?: { sectionKeys: Set<string>; skus: Set<string> };
};

// Section names match case- and spacing-insensitively, so "Fire alarm" and
// "fire  alarm" land in one section.
export function sectionKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, "_");
}

function parseQty(raw: string): number | null {
  if (!/^\d+(\.0+)?$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 && n <= 2_147_483_647 ? n : null;
}

export async function parseBomImport(buf: Buffer): Promise<BomParseResult> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
  } catch {
    return { ok: false, error: "unreadable" };
  }
  const ws = wb.getWorksheet("BOM") ?? wb.worksheets[0];
  if (!ws) return { ok: false, error: "unreadable" };

  const headerRow = ws.getRow(1);
  const found: string[] = [];
  for (let c = 1; c <= Math.max(headerRow.cellCount, BOM_IMPORT_COLUMNS.length); c++) {
    found.push(normalizeHeader(readCell(headerRow.getCell(c).value)));
  }
  while (found.length > 0 && found[found.length - 1] === "") found.pop();
  const expected = [...BOM_IMPORT_COLUMNS];
  if (found.length !== expected.length || found.some((h, i) => h !== expected[i])) {
    return { ok: false, error: "header_mismatch", expected, found };
  }

  const rows: BomImportRow[] = [];
  const errors: BomImportError[] = [];
  const firstRowBySku = new Map<string, number>();
  let dataRows = 0;

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const cells = BOM_IMPORT_COLUMNS.map((_, i) => readCell(row.getCell(i + 1).value));
    if (cells.every(c => c === "")) continue;
    dataRows += 1;
    if (dataRows > BOM_IMPORT_MAX_LINES) return { ok: false, error: "too_many_lines" };

    const [section, sku, qtyRaw, description, manufacturer, unit, vendorCode, category, subcategory] = cells;
    const rowErrors: BomImportError[] = [];

    if (!sku) rowErrors.push({ rowNumber: r, sku: "", reason: "missing_sku" });
    const qty = parseQty(qtyRaw);
    if (qty === null) rowErrors.push({ rowNumber: r, sku, reason: "bad_qty", value: qtyRaw });
    if (section.length > SECTION_NAME_MAX) rowErrors.push({ rowNumber: r, sku, reason: "section_too_long" });
    if (!category && subcategory) {
      rowErrors.push({ rowNumber: r, sku, reason: "subcategory_without_category", value: subcategory });
    }
    if (sku) {
      const first = firstRowBySku.get(sku);
      if (first !== undefined) {
        rowErrors.push({ rowNumber: r, sku, reason: "duplicate_sku", value: `row ${first}` });
      } else {
        firstRowBySku.set(sku, r);
      }
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      continue;
    }

    rows.push({
      rowNumber: r,
      section: section ? section.replace(/\s+/g, " ") : null,
      sku,
      qty: qty!,
      description,
      manufacturer,
      unit: unit || "pcs",
      vendorCode: vendorCode || null,
      category: category || null,
      subcategory: subcategory || null,
    });
  }

  if (dataRows === 0) return { ok: false, error: "empty" };
  return { ok: true, rows, errors };
}

/**
 * Checks the parsed rows against the catalog (new SKUs need what the catalog
 * needs) and describes what an import would do. Rows with errors are left out
 * of the counts; an import only runs when `errors` is empty.
 */
export function summarizeBomImport(
  fileName: string,
  parsed: { rows: BomImportRow[]; errors: BomImportError[] },
  ctx: BomImportContext,
): BomImportSummary & { rows: BomImportRow[] } {
  const errors = [...parsed.errors];
  const rows: BomImportRow[] = [];

  for (const r of parsed.rows) {
    if (ctx.existingSkus.has(r.sku)) {
      rows.push(r);
      continue;
    }
    const rowErrors: BomImportError[] = [];
    if (r.sku.length > SKU_MAX) rowErrors.push({ rowNumber: r.rowNumber, sku: r.sku, reason: "new_sku_too_long" });
    if (!r.description) rowErrors.push({ rowNumber: r.rowNumber, sku: r.sku, reason: "new_sku_missing_description" });
    if (!r.manufacturer) rowErrors.push({ rowNumber: r.rowNumber, sku: r.sku, reason: "new_sku_missing_manufacturer" });
    if (rowErrors.length > 0) errors.push(...rowErrors);
    else rows.push(r);
  }
  errors.sort((a, b) => a.rowNumber - b.rowNumber);

  const sections = new Map<string, { name: string; lines: number; isNew: boolean }>();
  let unsectionedLines = 0;
  let totalQty = 0;
  let mergedLines = 0;
  const newRows: BomImportRow[] = [];

  for (const r of rows) {
    totalQty += r.qty;
    if (r.section) {
      const key = sectionKey(r.section);
      const s = sections.get(key);
      if (s) s.lines += 1;
      else sections.set(key, { name: r.section, lines: 1, isNew: !ctx.target?.sectionKeys.has(key) });
    } else {
      unsectionedLines += 1;
    }
    if (ctx.target?.skus.has(r.sku)) mergedLines += 1;
    if (!ctx.existingSkus.has(r.sku)) newRows.push(r);
  }

  const refs = validateRows(
    { importId: "", fileName, rows: newRows.map(toCatalogRow), parserErrors: [] },
    ctx,
  );

  return {
    fileName,
    lines: rows.length,
    totalQty,
    sections: [...sections.values()],
    unsectionedLines,
    existingItems: rows.length - newRows.length,
    newItems: newRows.map(r => ({ sku: r.sku, description: r.description })),
    mergedLines,
    newVendors: refs.newVendors,
    newCategories: refs.newCategories,
    newSubcategories: refs.newSubcategories,
    errors,
    rows,
  };
}

export function toCatalogRow(r: BomImportRow): ParsedRow {
  return {
    rowNumber: r.rowNumber,
    sku: r.sku,
    description: r.description,
    manufacturer: r.manufacturer,
    unit: r.unit,
    vendorCode: r.vendorCode,
    category: r.category,
    subcategory: r.subcategory,
  };
}
