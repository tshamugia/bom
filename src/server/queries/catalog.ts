import "server-only";
import { and, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { items, categories, subcategories, vendors } from "@/db/schema";
import { requireSession } from "../auth-context";

export type ItemFilter = {
  search?: string;
  categoryId?: string;
  subcategoryId?: string;
  vendorId?: string;
};

export async function listItems(filter: ItemFilter) {
  await requireSession();
  const conds: SQL[] = [];
  if (filter.categoryId) conds.push(eq(items.categoryId, filter.categoryId));
  if (filter.subcategoryId) conds.push(eq(items.subcategoryId, filter.subcategoryId));
  if (filter.vendorId) conds.push(eq(items.vendorId, filter.vendorId));
  if (filter.search) {
    const q = `%${filter.search}%`;
    conds.push(or(ilike(items.sku, q), ilike(items.description, q), ilike(items.manufacturer, q))!);
  }

  const query = db
    .select({
      id: items.id, sku: items.sku, description: items.description, manufacturer: items.manufacturer,
      unit: items.unit,
      vendorName: vendors.name, vendorId: vendors.id,
      categoryName: categories.name, categoryId: categories.id,
      subcategoryName: subcategories.name, subcategoryId: subcategories.id,
    })
    .from(items)
    .leftJoin(vendors, eq(vendors.id, items.vendorId))
    .leftJoin(categories, eq(categories.id, items.categoryId))
    .leftJoin(subcategories, eq(subcategories.id, items.subcategoryId));

  return (conds.length > 0 ? query.where(and(...conds)) : query).orderBy(items.sku);
}

export async function listCategories() {
  await requireSession();
  return db
    .select({
      id: categories.id, name: categories.name,
      itemCount: sql<number>`(SELECT COUNT(*) FROM ${items} WHERE ${items.categoryId} = ${categories.id})`.mapWith(Number),
    })
    .from(categories)
    .orderBy(categories.name);
}
