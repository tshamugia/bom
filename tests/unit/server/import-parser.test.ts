import { describe, expect, test } from "vitest";
import ExcelJS from "exceljs";
import { parseImportBuffer } from "@/server/lib/import-parser";
import { TEMPLATE_COLUMNS } from "@/lib/schemas/import";

async function makeXlsx(rows: (string | number | null)[][], headers: string[] = [...TEMPLATE_COLUMNS]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("items");
  ws.addRow(headers);
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe("parseImportBuffer", () => {
  test("parses a well-formed sheet", async () => {
    const buf = await makeXlsx([
      ["RES-1", "10k resistor", "Yageo", "pcs", "MSR", "Passive", "Resistors"],
    ]);
    const r = await parseImportBuffer(buf);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows).toHaveLength(1);
    expect(r.rowErrors).toHaveLength(0);
    expect(r.rows[0]).toMatchObject({
      rowNumber: 2,
      sku: "RES-1",
      description: "10k resistor",
      manufacturer: "Yageo",
      unit: "pcs",
      vendorCode: "MSR",
      category: "Passive",
      subcategory: "Resistors",
    });
  });

  test("rejects header mismatch", async () => {
    const buf = await makeXlsx([], ["sku", "qty"]);
    const r = await parseImportBuffer(buf);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("header_mismatch");
    if (r.error === "header_mismatch") {
      expect(r.expected).toEqual([...TEMPLATE_COLUMNS]);
      expect(r.found).toEqual(["sku", "qty"]);
    }
  });
});

describe("parseImportBuffer error categories", () => {
  test("missing_required when sku blank", async () => {
    const buf = await makeXlsx([
      ["", "desc", "mfr", "pcs", "", "", ""],
    ]);
    const r = await parseImportBuffer(buf);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows).toHaveLength(0);
    expect(r.rowErrors[0]).toMatchObject({ reason: "missing_required", field: "sku" });
  });

  test("bad_subcategory_without_category", async () => {
    const buf = await makeXlsx([
      ["X", "desc", "mfr", "pcs", "", "", "Resistors"],
    ]);
    const r = await parseImportBuffer(buf);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rowErrors[0]).toMatchObject({ reason: "bad_subcategory_without_category" });
  });

  test("duplicate_in_file flagged on second occurrence only", async () => {
    const buf = await makeXlsx([
      ["X", "desc", "mfr", "pcs", "", "", ""],
      ["X", "desc", "mfr", "pcs", "", "", ""],
    ]);
    const r = await parseImportBuffer(buf);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows).toHaveLength(1);
    expect(r.rowErrors).toHaveLength(1);
    expect(r.rowErrors[0]).toMatchObject({ rowNumber: 3, reason: "duplicate_in_file" });
  });

  test("blank rows skipped, defaults applied", async () => {
    const buf = await makeXlsx([
      ["", "", "", "", "", "", ""],
      ["Y", "desc", "mfr", "", "", "", ""],
    ]);
    const r = await parseImportBuffer(buf);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({ unit: "pcs" });
  });

  test("rejects unreadable buffer", async () => {
    const r = await parseImportBuffer(Buffer.from("not an xlsx"));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("unreadable");
  });
});

test("parses a 5,000-row file in under 2 seconds", async () => {
  const fs = await import("node:fs");
  const path = "tests/fixtures/catalog-import/big.xlsx";
  if (!fs.existsSync(path)) return;
  const buf = fs.readFileSync(path);
  const t0 = performance.now();
  const r = await parseImportBuffer(buf);
  const elapsed = performance.now() - t0;
  expect(r.ok).toBe(true);
  expect(elapsed).toBeLessThan(2000);
});
