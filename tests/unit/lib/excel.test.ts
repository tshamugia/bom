import { expect, test } from "vitest";
import ExcelJS from "exceljs";
import { buildBomWorkbook, type BomRow } from "@/lib/excel";

const ROWS: BomRow[] = [
  { sku: "RES-1", description: "10k", manufacturer: "Yageo", vendor: "Mouser", unit: "pcs", qty: 10, unitPrice: 0.012 },
  { sku: "CAP-1", description: "100nF", manufacturer: "Murata", vendor: "DigiSource", unit: "pcs", qty: 18, unitPrice: 0.018 },
];

test("buildBomWorkbook produces a workbook with header, rows, and totals", async () => {
  const buf = await buildBomWorkbook({
    project: { code: "TEST-1", name: "Test Project", quantity: 50, owner: "M. Chen", target: "May 14, 2026" },
    revisionLetter: "A",
    rows: ROWS,
    options: { includeVendorPricing: true, includeStockAvailability: false, groupByVendor: false, includeCoverPage: false },
  });

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const sheet = wb.getWorksheet("BOM");
  expect(sheet).toBeDefined();
  expect(sheet!.getCell("A1").value).toBe("Bill of Materials");
  expect(sheet!.getCell("A5").value).toBe("#");
  expect(sheet!.getCell("B5").value).toBe("SKU");
  expect(sheet!.getCell("B6").value).toBe("RES-1");
  // Total formula in last data row's "Total" column (col I = 9).
  const totalCell = sheet!.getRow(7).getCell(9);
  expect(typeof totalCell.value).toBe("object");
});

test("groupByVendor=true creates per-vendor sheets", async () => {
  const buf = await buildBomWorkbook({
    project: { code: "T", name: "T", quantity: 1, owner: "X", target: "—" },
    revisionLetter: "A",
    rows: ROWS,
    options: { includeVendorPricing: true, includeStockAvailability: false, groupByVendor: true, includeCoverPage: false },
  });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  expect(wb.getWorksheet("Mouser")).toBeDefined();
  expect(wb.getWorksheet("DigiSource")).toBeDefined();
});
