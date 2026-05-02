import "server-only";
import type { ParsedRow, RowError, DryRunResult, ValidatorContext } from "@/lib/schemas/import";

type Input = {
  importId: string;
  fileName: string;
  rows: ParsedRow[];
  parserErrors: RowError[];
};

export function validateRows(input: Input, ctx: ValidatorContext): DryRunResult {
  const errorRows: RowError[] = [...input.parserErrors];
  const newVendors = new Set<string>();
  const newCategories = new Set<string>();
  const newSubPairs = new Map<string, { category: string; subcategory: string }>();
  const existingSkusInFile: string[] = [];

  let toAdd = 0;
  let toUpdate = 0;

  for (const row of input.rows) {
    if (row.vendorCode && !ctx.existingVendorCodes.has(row.vendorCode)) {
      newVendors.add(row.vendorCode);
    }

    if (row.category) {
      const subs = ctx.existingCategories.get(row.category);
      const categoryWillBeCreated = !subs;
      if (categoryWillBeCreated) newCategories.add(row.category);

      if (row.subcategory) {
        if (categoryWillBeCreated || !subs!.has(row.subcategory)) {
          const key = `${row.category}::${row.subcategory}`;
          if (!newSubPairs.has(key)) {
            newSubPairs.set(key, { category: row.category, subcategory: row.subcategory });
          }
        }
      }
    }

    if (ctx.existingSkus.has(row.sku)) {
      toUpdate += 1;
      existingSkusInFile.push(row.sku);
    } else {
      toAdd += 1;
    }
  }

  return {
    importId: input.importId,
    fileName: input.fileName,
    counts: {
      total: input.rows.length + input.parserErrors.length,
      toAdd,
      toUpdate,
      errored: errorRows.length,
    },
    errorRows,
    newVendors: [...newVendors],
    newCategories: [...newCategories],
    newSubcategories: [...newSubPairs.values()],
    existingSkusInFile,
  };
}
