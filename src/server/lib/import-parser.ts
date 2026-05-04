import "server-only";
import ExcelJS from "exceljs";
import {
  TEMPLATE_COLUMNS,
  type ParsedRow,
  type ParserResult,
  type RowError,
} from "@/lib/schemas/import";

export async function parseImportBuffer(buf: Buffer): Promise<ParserResult> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
  } catch {
    return { ok: false, error: "unreadable" };
  }
  const ws = wb.worksheets[0];
  if (!ws) return { ok: false, error: "unreadable" };

  const headerRow = ws.getRow(1);
  const maxCol = Math.max(headerRow.actualCellCount ?? 0, TEMPLATE_COLUMNS.length);
  const rawHeaders: string[] = [];
  for (let c = 1; c <= maxCol + 1; c++) {
    const v = headerRow.getCell(c).value;
    rawHeaders.push(typeof v === "string" ? v : v == null ? "" : String(v));
  }
  while (rawHeaders.length > 0 && rawHeaders[rawHeaders.length - 1] === "") rawHeaders.pop();
  const found = rawHeaders;

  const expected = [...TEMPLATE_COLUMNS];
  if (found.length !== expected.length || found.some((h, i) => h !== expected[i])) {
    return { ok: false, error: "header_mismatch", expected, found };
  }

  const rows: ParsedRow[] = [];
  const rowErrors: RowError[] = [];
  const seenSkus = new Set<string>();

  const lastRowNumber = ws.actualRowCount;
  for (let r = 2; r <= lastRowNumber; r++) {
    const row = ws.getRow(r);
    const cells = TEMPLATE_COLUMNS.map((_, i) => readCell(row.getCell(i + 1).value));
    if (cells.every(c => c === "")) continue;

    const [sku, description, manufacturer, unitRaw, vendorCode, category, subcategory] = cells;
    const errors: RowError[] = [];

    if (!sku) errors.push({ rowNumber: r, sku: "", reason: "missing_required", field: "sku" });
    if (!description) errors.push({ rowNumber: r, sku, reason: "missing_required", field: "description" });
    if (!manufacturer) errors.push({ rowNumber: r, sku, reason: "missing_required", field: "manufacturer" });

    if (!category && subcategory) errors.push({ rowNumber: r, sku, reason: "bad_subcategory_without_category", field: "subcategory", value: subcategory });

    if (sku && seenSkus.has(sku)) errors.push({ rowNumber: r, sku, reason: "duplicate_in_file", field: "sku" });
    if (sku) seenSkus.add(sku);

    if (errors.length > 0) {
      rowErrors.push(...errors);
      continue;
    }

    rows.push({
      rowNumber: r,
      sku,
      description,
      manufacturer,
      unit: unitRaw === "" ? "pcs" : unitRaw,
      vendorCode: vendorCode || null,
      category: category || null,
      subcategory: subcategory || null,
    });
  }

  return { ok: true, rows, rowErrors };
}

function readCell(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    const obj = v as unknown as Record<string, unknown>;
    if (typeof obj.text === "string") return obj.text.trim();
    if (Array.isArray(obj.richText)) {
      return obj.richText.map((p: { text?: string }) => p.text ?? "").join("").trim();
    }
    if ("result" in obj) return readCell(obj.result as ExcelJS.CellValue);
  }
  return String(v).trim();
}
