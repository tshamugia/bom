import "server-only";
import { and, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { items, categories, subcategories, vendors } from "@/db/schema";
import { getCurrentOrgId } from "../org";

export type ItemFilter = {
  search?: string;
  categoryId?: string;
  subcategoryId?: string;
  vendorId?: string;
  stockState?: "in-stock" | "low-stock" | "backorder" | "out-of-stock";
};

export async function listItems(filter: ItemFilter) {
  const orgId = await getCurrentOrgId();
  const conds: SQL[] = [eq(items.organizationId, orgId)];
  if (filter.categoryId) conds.push(eq(items.categoryId, filter.categoryId));
  if (filter.subcategoryId) conds.push(eq(items.subcategoryId, filter.subcategoryId));
  if (filter.vendorId) conds.push(eq(items.vendorId, filter.vendorId));
  if (filter.stockState) conds.push(eq(items.stockState, filter.stockState));
  if (filter.search) {
    const q = `%${filter.search}%`;
    conds.push(or(ilike(items.sku, q), ilike(items.description, q), ilike(items.manufacturer, q))!);
  }

  return db
    .select({
      id: items.id, sku: items.sku, description: items.description, manufacturer: items.manufacturer,
      unit: items.unit, unitPrice: items.unitPrice, onHand: items.onHand, stockState: items.stockState,
      vendorName: vendors.name, vendorId: vendors.id,
      categoryName: categories.name, categoryId: categories.id,
      subcategoryName: subcategories.name, subcategoryId: subcategories.id,
    })
    .from(items)
    .leftJoin(vendors, eq(vendors.id, items.vendorId))
    .leftJoin(categories, eq(categories.id, items.categoryId))
    .leftJoin(subcategories, eq(subcategories.id, items.subcategoryId))
    .where(and(...conds))
    .orderBy(items.sku);
}

export async function listCategories() {
  const orgId = await getCurrentOrgId();
  return db
    .select({
      id: categories.id, name: categories.name,
      itemCount: sql<number>`(SELECT COUNT(*) FROM ${items} WHERE ${items.categoryId} = ${categories.id})`.mapWith(Number),
    })
    .from(categories)
    .where(eq(categories.organizationId, orgId))
    .orderBy(categories.name);
}
