import { expect, test } from "vitest";
import ExcelJS from "exceljs";
import { BOM_IMPORT_COLUMNS } from "@/lib/schemas/bom-import";
import { parseBomImport, summarizeBomImport, type BomImportContext } from "@/server/lib/bom-import";
import { buildBomImportTemplate } from "@/server/lib/bom-import-template";

async function xlsx(rows: (string | number | null)[][], headers: string[] = [...BOM_IMPORT_COLUMNS]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("BOM");
  ws.addRow(headers);
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function ctx(overrides: Partial<BomImportContext> = {}): BomImportContext {
  return {
    existingSkus: new Set(["CAT-1"]),
    existingVendorCodes: new Set(["MSR"]),
    existingCategories: new Map([["Fire", new Set(["Detectors"])]]),
    ...overrides,
  };
}

test("the downloaded template has the import header and no lines", async () => {
  const r = await parseBomImport(await buildBomImportTemplate());
  expect(r).toEqual({ ok: false, error: "empty" });
});

test("a filled-in template parses", async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load((await buildBomImportTemplate()) as unknown as ArrayBuffer);
  wb.getWorksheet("BOM")!.addRow(["Fire alarm", "CAT-1", 3]);
  const r = await parseBomImport(Buffer.from(await wb.xlsx.writeBuffer()));
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.rows).toMatchObject([{ rowNumber: 2, section: "Fire alarm", sku: "CAT-1", qty: 3, unit: "pcs" }]);
});

test("header must match the template (case and spaces don't matter)", async () => {
  const bad = await parseBomImport(await xlsx([], ["sku", "qty"]));
  expect(bad).toMatchObject({ ok: false, error: "header_mismatch", found: ["sku", "qty"] });

  const loose = BOM_IMPORT_COLUMNS.map(c => c.toUpperCase().replace("_", " "));
  const ok = await parseBomImport(await xlsx([["", "CAT-1", 1]], loose));
  expect(ok.ok).toBe(true);
});

test("rejects a file that isn't xlsx", async () => {
  expect(await parseBomImport(Buffer.from("sku,qty\nA,1"))).toEqual({ ok: false, error: "unreadable" });
});

test("row errors: missing sku, bad qty, duplicate sku, subcategory without category", async () => {
  const r = await parseBomImport(await xlsx([
    ["", "", 1],
    ["", "A", 0],
    ["", "B", 2.5],
    ["", "C", "abc"],
    ["", "D", 1],
    ["", "D", 2],
    ["", "E", 1, "d", "m", "", "", "", "Sub"],
    [null, null, null],
    ["", "F", "4"],
  ]));
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.errors.map(e => [e.rowNumber, e.reason])).toEqual([
    [2, "missing_sku"],
    [3, "bad_qty"],
    [4, "bad_qty"],
    [5, "bad_qty"],
    [7, "duplicate_sku"],
    [8, "subcategory_without_category"],
  ]);
  expect(r.errors.find(e => e.reason === "duplicate_sku")?.value).toBe("row 6");
  expect(r.rows.map(x => [x.sku, x.qty])).toEqual([["D", 1], ["F", 4]]);
});

test("summary: new SKUs need description and manufacturer; existing ones don't", async () => {
  const r = await parseBomImport(await xlsx([
    ["", "CAT-1", 2],
    ["", "NEW-1", 1, "", "Bosch"],
    ["", "NEW-2", 1, "Detector", ""],
    ["", "NEW-3", 1, "Detector", "Bosch"],
  ]));
  if (!r.ok) throw new Error("parse failed");
  const s = summarizeBomImport("f.xlsx", r, ctx());
  expect(s.errors.map(e => [e.rowNumber, e.reason])).toEqual([
    [3, "new_sku_missing_description"],
    [4, "new_sku_missing_manufacturer"],
  ]);
  expect(s.lines).toBe(2);
  expect(s.existingItems).toBe(1);
  expect(s.newItems).toEqual([{ sku: "NEW-3", description: "Detector" }]);
});

test("summary: sections group case-insensitively, keep file order and count lines", async () => {
  const r = await parseBomImport(await xlsx([
    ["Fire alarm", "CAT-1", 2],
    ["IT", "N1", 5, "d", "m", "pcs", "NEWV", "Net", "Switches"],
    ["fire  ALARM", "N2", 1, "d", "m", "pcs", "MSR", "Fire", "Detectors"],
    ["", "N3", 1, "d", "m", "", "", "Fire", "Bells"],
  ]));
  if (!r.ok) throw new Error("parse failed");
  const s = summarizeBomImport("f.xlsx", r, ctx());
  expect(s.errors).toEqual([]);
  expect(s.sections).toEqual([
    { name: "Fire alarm", lines: 2, isNew: true },
    { name: "IT", lines: 1, isNew: true },
  ]);
  expect(s.unsectionedLines).toBe(1);
  expect(s.totalQty).toBe(9);
  expect(s.newVendors).toEqual(["NEWV"]);
  expect(s.newCategories).toEqual(["Net"]);
  expect(s.newSubcategories).toEqual([
    { category: "Net", subcategory: "Switches" },
    { category: "Fire", subcategory: "Bells" },
  ]);
});

test("summary for a draft: flags SKUs already on it and sections it already has", async () => {
  const r = await parseBomImport(await xlsx([
    ["Fire alarm", "CAT-1", 2],
    ["IT", "CAT-2", 1],
  ]));
  if (!r.ok) throw new Error("parse failed");
  const s = summarizeBomImport("f.xlsx", r, ctx({
    existingSkus: new Set(["CAT-1", "CAT-2"]),
    target: { sectionKeys: new Set(["fire alarm"]), skus: new Set(["CAT-1"]) },
  }));
  expect(s.mergedLines).toBe(1);
  expect(s.sections.map(x => [x.name, x.isNew])).toEqual([["Fire alarm", false], ["IT", true]]);
});
