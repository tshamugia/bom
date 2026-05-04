import { describe, expect, test } from "vitest";
import { validateRows } from "@/server/lib/import-validator";
import type { ParsedRow, ValidatorContext } from "@/lib/schemas/import";

function ctx(overrides: Partial<ValidatorContext> = {}): ValidatorContext {
  return {
    existingSkus: new Set(),
    existingVendorCodes: new Set(["MSR"]),
    existingCategories: new Map([["Passive", new Set(["Resistors"])]]),
    ...overrides,
  };
}

const baseRow = (over: Partial<ParsedRow> = {}): ParsedRow => ({
  rowNumber: 2,
  sku: "X",
  description: "d",
  manufacturer: "m",
  unit: "pcs",
  vendorCode: null,
  category: null,
  subcategory: null,
  ...over,
});

describe("validateRows", () => {
  test("counts a brand-new row as toAdd", () => {
    const r = validateRows({ rows: [baseRow()], parserErrors: [], importId: "imp1", fileName: "f.xlsx" }, ctx());
    expect(r.counts).toMatchObject({ total: 1, toAdd: 1, toUpdate: 0, errored: 0 });
  });

  test("existing SKU counted as toUpdate (radio chooses behavior on commit)", () => {
    const r = validateRows({ rows: [baseRow({ sku: "OLD" })], parserErrors: [], importId: "i", fileName: "f" }, ctx({ existingSkus: new Set(["OLD"]) }));
    expect(r.counts).toMatchObject({ toAdd: 0, toUpdate: 1 });
    expect(r.existingSkusInFile).toEqual(["OLD"]);
  });

  test("missing vendor flagged as auto-create, not error", () => {
    const r = validateRows({ rows: [baseRow({ vendorCode: "NEWCO" })], parserErrors: [], importId: "i", fileName: "f" }, ctx());
    expect(r.newVendors).toEqual(["NEWCO"]);
    expect(r.errorRows).toHaveLength(0);
  });

  test("missing category flagged as auto-create", () => {
    const r = validateRows({ rows: [baseRow({ category: "Sensors" })], parserErrors: [], importId: "i", fileName: "f" }, ctx());
    expect(r.newCategories).toEqual(["Sensors"]);
  });

  test("missing subcategory in existing category flagged as auto-create", () => {
    const r = validateRows({ rows: [baseRow({ category: "Passive", subcategory: "Capacitors" })], parserErrors: [], importId: "i", fileName: "f" }, ctx());
    expect(r.newSubcategories).toEqual([{ category: "Passive", subcategory: "Capacitors" }]);
    expect(r.errorRows).toHaveLength(0);
  });

  test("subcategory_not_in_category is an error only when both are existing and the pair is wrong — when the category is being auto-created, the sub is also auto-created", () => {
    const r = validateRows({ rows: [baseRow({ category: "NewCat", subcategory: "NewSub" })], parserErrors: [], importId: "i", fileName: "f" }, ctx());
    expect(r.newCategories).toEqual(["NewCat"]);
    expect(r.newSubcategories).toEqual([{ category: "NewCat", subcategory: "NewSub" }]);
    expect(r.errorRows).toHaveLength(0);
  });

  test("parser-supplied errors are passed through and counted", () => {
    const r = validateRows({
      rows: [],
      parserErrors: [{ rowNumber: 5, sku: "BAD", reason: "missing_required", field: "sku" }],
      importId: "i", fileName: "f",
    }, ctx());
    expect(r.counts.errored).toBe(1);
    expect(r.errorRows).toHaveLength(1);
  });

  test("dedupes the auto-create lists", () => {
    const r = validateRows({
      rows: [
        baseRow({ rowNumber: 2, sku: "A", vendorCode: "NEWCO", category: "Sensors" }),
        baseRow({ rowNumber: 3, sku: "B", vendorCode: "NEWCO", category: "Sensors" }),
      ],
      parserErrors: [],
      importId: "i", fileName: "f",
    }, ctx());
    expect(r.newVendors).toEqual(["NEWCO"]);
    expect(r.newCategories).toEqual(["Sensors"]);
  });
});
