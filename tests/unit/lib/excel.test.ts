import { expect, test } from "vitest";
import ExcelJS from "exceljs";
import { buildBomWorkbook, type BomRow, type ExportColumns } from "@/lib/excel";

const ROWS: BomRow[] = [
  { sku: "RES-1", description: "10k", manufacturer: "Yageo", vendor: "Mouser", unit: "pcs", qty: 10, sectionName: null, sectionPosition: null },
  { sku: "CAP-1", description: "100nF", manufacturer: "Murata", vendor: "DigiSource", unit: "pcs", qty: 18, sectionName: null, sectionPosition: null },
];

function allColumns(overrides: Partial<ExportColumns> = {}): ExportColumns {
  return {
    sku: true,
    description: true,
    manufacturer: true,
    vendor: true,
    unit: true,
    qty: true,
    ...overrides,
  };
}

test("buildBomWorkbook produces a workbook with header and rows", async () => {
  const buf = await buildBomWorkbook({
    project: { code: "TEST-1", name: "Test Project", owner: "M. Chen", target: "May 14, 2026" },
    revisionLetter: "A",
    rows: ROWS,
    options: { columns: allColumns(), groupByVendor: false, includeCoverPage: false },
  });

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as never);
  const sheet = wb.getWorksheet("BOM");
  expect(sheet).toBeDefined();
  expect(sheet!.getCell("A1").value).toBe("Bill of Materials");
  expect(sheet!.getCell("A5").value).toBe("#");
  expect(sheet!.getCell("B5").value).toBe("SKU");
  expect(sheet!.getCell("B6").value).toBe("RES-1");
  expect(sheet!.getCell("G5").value).toBe("Qty");
  expect(sheet!.getRow(6).getCell(7).value).toBe(10);
});

test("groupByVendor=true creates per-vendor sheets", async () => {
  const buf = await buildBomWorkbook({
    project: { code: "T", name: "T", owner: "X", target: "—" },
    revisionLetter: "A",
    rows: ROWS,
    options: { columns: allColumns(), groupByVendor: true, includeCoverPage: false },
  });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as never);
  expect(wb.getWorksheet("Mouser")).toBeDefined();
  expect(wb.getWorksheet("DigiSource")).toBeDefined();
});

test("buildBomWorkbook renders section heading rows", async () => {
  const SECTIONED: BomRow[] = [
    { sku: "U-1", description: "stray", manufacturer: "x", vendor: "V", unit: "pcs", qty: 2, sectionName: null, sectionPosition: null },
    { sku: "FA-1", description: "smoke", manufacturer: "x", vendor: "V", unit: "pcs", qty: 4, sectionName: "Fire Alarm", sectionPosition: 0 },
    { sku: "FA-2", description: "horn", manufacturer: "x", vendor: "V", unit: "pcs", qty: 1, sectionName: "Fire Alarm", sectionPosition: 0 },
    { sku: "IT-1", description: "switch", manufacturer: "x", vendor: "V", unit: "pcs", qty: 3, sectionName: "IT Network", sectionPosition: 1 },
  ];

  const buf = await buildBomWorkbook({
    project: { code: "T", name: "T", owner: "X", target: "—" },
    revisionLetter: "A",
    rows: SECTIONED,
    options: { columns: allColumns(), groupByVendor: false, includeCoverPage: false },
  });

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as never);
  const sheet = wb.getWorksheet("BOM")!;

  const headings: { row: number; value: unknown }[] = [];
  sheet.eachRow((row, rowNum) => {
    const a = row.getCell(1).value;
    if (typeof a === "string" && (a === "Uncategorized" || a === "Fire Alarm" || a === "IT Network")) {
      headings.push({ row: rowNum, value: a });
    }
  });
  expect(headings.map(h => h.value)).toEqual(["Uncategorized", "Fire Alarm", "IT Network"]);
});

test("draft workbook embeds DRAFT — NOT FOR PROCUREMENT band on cover", async () => {
  const buf = await buildBomWorkbook({
    project: { code: "P", name: "P", owner: "T", target: "—" },
    revisionLetter: "A",
    rows: [{ sku: "S", description: "d", manufacturer: "m", vendor: "V", unit: "pcs", qty: 1, sectionName: null, sectionPosition: null }],
    options: {
      columns: allColumns(),
      groupByVendor: false,
      includeCoverPage: true,
    },
    isDraft: true,
  });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as never);
  const cover = wb.worksheets.find(ws => ws.name === "Cover");
  expect(cover).toBeDefined();
  let found = false;
  cover!.eachRow(row => row.eachCell(cell => {
    if (typeof cell.value === "string" && cell.value.includes("DRAFT")) found = true;
  }));
  expect(found).toBe(true);
});

test("buildBomWorkbook with only Uncategorized lines stays flat (no heading row)", async () => {
  const buf = await buildBomWorkbook({
    project: { code: "T", name: "T", owner: "X", target: "—" },
    revisionLetter: "A",
    rows: ROWS,
    options: { columns: allColumns(), groupByVendor: false, includeCoverPage: false },
  });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as never);
  const sheet = wb.getWorksheet("BOM")!;
  expect(sheet.getCell("A6").value).toBe(1);
  expect(sheet.getCell("B6").value).toBe("RES-1");
});

test("hidden columns are omitted from the header row", async () => {
  const buf = await buildBomWorkbook({
    project: { code: "T", name: "T", owner: "X", target: "—" },
    revisionLetter: "A",
    rows: ROWS,
    options: {
      columns: {
        sku: true,
        description: false,
        manufacturer: false,
        vendor: false,
        unit: false,
        qty: true,
      },
      groupByVendor: false,
      includeCoverPage: false,
    },
  });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as never);
  const sheet = wb.getWorksheet("BOM")!;
  expect(sheet.getCell("A5").value).toBe("#");
  expect(sheet.getCell("B5").value).toBe("SKU");
  expect(sheet.getCell("C5").value).toBe("Qty");
  expect(sheet.getCell("D5").value).toBeFalsy();
});
