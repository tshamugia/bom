import "server-only";
import { inArray } from "drizzle-orm";
import { db as defaultDb } from "@/db/client";
import { vendors, categories, subcategories } from "@/db/schema";

type Db = typeof defaultDb;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export type CatalogRefPlan = {
  newVendors: string[];
  newCategories: string[];
  newSubcategories: { category: string; subcategory: string }[];
};

/**
 * Creates the vendors (by code), categories and subcategories an import names
 * but the catalog doesn't have yet, and returns id lookups covering both the
 * existing and the new ones. Subcategories are keyed `category::subcategory`.
 */
export async function ensureCatalogRefs(tx: Tx, plan: CatalogRefPlan) {
  const vendorIdByCode = new Map<string, string>();
  const existingVs = await tx.select({ id: vendors.id, code: vendors.code }).from(vendors);
  for (const v of existingVs) vendorIdByCode.set(v.code, v.id);

  let vendorsCreated = 0;
  for (const code of plan.newVendors) {
    if (vendorIdByCode.has(code)) continue;
    const [row] = await tx.insert(vendors).values({
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
  const existingCs = await tx.select({ id: categories.id, name: categories.name }).from(categories);
  for (const c of existingCs) catIdByName.set(c.name, c.id);

  let categoriesCreated = 0;
  for (const name of plan.newCategories) {
    if (catIdByName.has(name)) continue;
    const [row] = await tx.insert(categories).values({ name }).returning({ id: categories.id, name: categories.name });
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

  let subcategoriesCreated = 0;
  for (const pair of plan.newSubcategories) {
    const key = `${pair.category}::${pair.subcategory}`;
    if (subIdByPair.has(key)) continue;
    const catId = catIdByName.get(pair.category)!;
    const [row] = await tx.insert(subcategories).values({ name: pair.subcategory, categoryId: catId }).returning({ id: subcategories.id, name: subcategories.name });
    subIdByPair.set(`${pair.category}::${row.name}`, row.id);
    subcategoriesCreated += 1;
  }

  return {
    vendorIdByCode,
    catIdByName,
    subIdByPair,
    created: { vendors: vendorsCreated, categories: categoriesCreated, subcategories: subcategoriesCreated },
  };
}
