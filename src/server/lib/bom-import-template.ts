import "server-only";
import ExcelJS from "exceljs";
import { BOM_IMPORT_COLUMNS, BOM_IMPORT_MAX_LINES, type BomImportColumn } from "@/lib/schemas/bom-import";

const WIDTHS: Record<BomImportColumn, number> = {
  section: 20, sku: 20, qty: 8, description: 40, manufacturer: 18, unit: 8,
  vendor_code: 14, category: 18, subcategory: 18,
};

const GUIDE: [BomImportColumn, string, string][] = [
  ["section", "No", "Section the line goes in, e.g. “Fire alarm”. Rows with the same name are grouped. Leave empty for no section."],
  ["sku", "Yes", "Catalog SKU. A SKU the catalog doesn't have is added to it from this row."],
  ["qty", "Yes", "Whole number above 0."],
  ["description", "New SKUs", "Item description. Only used when the SKU is new — catalog items keep their own data."],
  ["manufacturer", "New SKUs", "Manufacturer. Only used when the SKU is new."],
  ["unit", "No", "Unit, e.g. pcs or m. Empty means pcs. Only used when the SKU is new."],
  ["vendor_code", "No", "Vendor code. An unknown code adds the vendor. Only used when the SKU is new."],
  ["category", "No", "Category. An unknown one is added. Only used when the SKU is new."],
  ["subcategory", "No", "Subcategory inside the category (needs a category). Only used when the SKU is new."],
];

const EXAMPLE: string[][] = [
  ["Fire alarm", "FA-DET-OPT", "24", "Optical smoke detector", "Bosch", "pcs", "", "Fire alarm", "Detectors"],
  ["Fire alarm", "FA-MCP-01", "6", "Manual call point", "Bosch", "pcs", "", "Fire alarm", "Call points"],
  ["IT network", "CAB-CAT6-305", "4", "Cat6 U/UTP cable, 305 m box", "Legrand", "box", "", "Cabling", ""],
];

/** The BOM import template: an empty "BOM" sheet with the header row, plus a guide. */
export async function buildBomImportTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Revline";

  const ws = wb.addWorksheet("BOM", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.addRow([...BOM_IMPORT_COLUMNS]);
  ws.getRow(1).font = { bold: true };
  BOM_IMPORT_COLUMNS.forEach((c, i) => { ws.getColumn(i + 1).width = WIDTHS[c]; });
  // SKUs and sections are text even when they look like numbers.
  for (const c of ["section", "sku"] as const) {
    ws.getColumn(BOM_IMPORT_COLUMNS.indexOf(c) + 1).numFmt = "@";
  }

  const guide = wb.addWorksheet("How to fill");
  guide.getColumn(1).width = 16;
  guide.getColumn(2).width = 12;
  guide.getColumn(3).width = 90;
  guide.addRow(["Fill the BOM sheet, one row per line, and upload the file in Revline (New BOM → From file, or Import in the builder)."]).font = { bold: true };
  guide.addRow([]);
  guide.addRow(["Column", "Required", "What to enter"]).font = { bold: true };
  for (const row of GUIDE) guide.addRow(row);
  guide.addRow([]);
  guide.addRow(["Rules"]).font = { bold: true };
  for (const rule of [
    "Keep the header row and the column order as they are.",
    "List each SKU once — add the quantities together.",
    `Up to ${BOM_IMPORT_MAX_LINES.toLocaleString("en-US")} lines per file.`,
    "You see a preview before anything is saved. If any row has an error, nothing is imported — fix the file and upload it again.",
    "Importing into a draft that already has the SKU adds the file's quantity to its line.",
  ]) guide.addRow(["", "", rule]);
  guide.addRow([]);
  guide.addRow(["Example (don't copy it into the BOM sheet unless the items are real)"]).font = { bold: true };
  guide.addRow([...BOM_IMPORT_COLUMNS]).font = { italic: true };
  for (const row of EXAMPLE) guide.addRow(row);
  guide.getColumn(3).alignment = { wrapText: true, vertical: "top" };

  return Buffer.from(await wb.xlsx.writeBuffer());
}
