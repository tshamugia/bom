import "server-only";
import { db } from "@/db/client";
import { items, vendors, categories, subcategories } from "@/db/schema";
import type { ValidatorContext } from "@/lib/schemas/import";

export async function loadValidatorContext(): Promise<ValidatorContext> {
  const skus = await db.select({ sku: items.sku }).from(items);
  const vs   = await db.select({ code: vendors.code }).from(vendors);
  const cs   = await db.select({ id: categories.id, name: categories.name }).from(categories);
  const subs = await db.select({ name: subcategories.name, categoryId: subcategories.categoryId }).from(subcategories);

  const subsByCatId = new Map<string, Set<string>>();
  for (const s of subs) {
    if (!subsByCatId.has(s.categoryId)) subsByCatId.set(s.categoryId, new Set());
    subsByCatId.get(s.categoryId)!.add(s.name);
  }
  const existingCategories = new Map<string, Set<string>>();
  for (const c of cs) existingCategories.set(c.name, subsByCatId.get(c.id) ?? new Set());

  return {
    existingSkus: new Set(skus.map(s => s.sku)),
    existingVendorCodes: new Set(vs.map(v => v.code)),
    existingCategories,
  };
}
