import { eq, inArray, sql } from "drizzle-orm";
import { db } from "./client";
import { categories, subcategories, vendors, items } from "./schema";
import { VENDORS, CATEGORIES, ITEMS } from "./seed-items-data";

/**
 * Seeds the catalog with ~100 equipment items across the three disciplines used
 * in the app: Fire, El (Electrical) and BMS.
 *
 * Two modes (SEED_MODE env var):
 *   - "reset"  (default) — TRUNCATE the catalog tables first, then insert. Gives
 *     a clean, deterministic dataset. Use ONLY on dev.
 *   - "insert" — additive/idempotent. Never truncates: inserts vendors,
 *     categories and subcategories that are missing (matched by code/name) and
 *     items that don't already exist (matched by unique SKU). Safe for prod.
 *
 * Run with:
 *   npx tsx --env-file=.env.local src/db/seed-items.ts             # reset (dev)
 *   SEED_MODE=insert npx tsx --env-file=.env.local src/db/seed-items.ts
 */

const MODE = (process.env.SEED_MODE ?? "reset") as "reset" | "insert";

async function main() {
  console.log(`Seeding ${ITEMS.length} items (mode: ${MODE})...`);

  if (MODE === "reset") {
    // Clean slate for the catalog tables (items reference vendors/categories).
    await db.execute(
      sql`TRUNCATE TABLE ${items}, ${subcategories}, ${categories}, ${vendors} RESTART IDENTITY CASCADE`,
    );
  }

  // ---- Vendors (match on code; vendor.code has no unique constraint) --------
  const existingVendors = await db.select({ id: vendors.id, code: vendors.code }).from(vendors);
  const vendorByCode = new Map(existingVendors.map(v => [v.code, v.id]));
  const missingVendors = VENDORS.filter(v => !vendorByCode.has(v.code));
  if (missingVendors.length) {
    const rows = await db
      .insert(vendors)
      .values(missingVendors.map(v => ({ ...v })))
      .returning({ id: vendors.id, code: vendors.code });
    for (const r of rows) vendorByCode.set(r.code, r.id);
  }

  // ---- Categories (match on name) ------------------------------------------
  const existingCats = await db.select({ id: categories.id, name: categories.name }).from(categories);
  const catByName = new Map(existingCats.map(c => [c.name, c.id]));
  for (const cat of CATEGORIES) {
    if (!catByName.has(cat.name)) {
      const [row] = await db.insert(categories).values({ name: cat.name }).returning({ id: categories.id });
      catByName.set(cat.name, row.id);
    }
  }

  // ---- Subcategories (match on category + name) ----------------------------
  const catIds = [...catByName.values()];
  const existingSubs = catIds.length
    ? await db
        .select({ id: subcategories.id, categoryId: subcategories.categoryId, name: subcategories.name })
        .from(subcategories)
        .where(inArray(subcategories.categoryId, catIds))
    : [];
  const subByKey = new Map(existingSubs.map(s => [`${s.categoryId}::${s.name}`, s.id]));
  for (const cat of CATEGORIES) {
    const categoryId = catByName.get(cat.name)!;
    for (const sub of cat.subcategories) {
      const key = `${categoryId}::${sub}`;
      if (!subByKey.has(key)) {
        const [row] = await db
          .insert(subcategories)
          .values({ categoryId, name: sub })
          .returning({ id: subcategories.id });
        subByKey.set(key, row.id);
      }
    }
  }

  // ---- Items (unique SKU; skip existing) -----------------------------------
  const itemValues = ITEMS.map(it => ({
    sku: it.sku,
    description: it.description,
    manufacturer: it.manufacturer,
    unit: it.unit,
    vendorId: vendorByCode.get(it.vendor) ?? null,
    categoryId: catByName.get(it.category) ?? null,
    subcategoryId: subByKey.get(`${catByName.get(it.category)}::${it.subcategory}`) ?? null,
  }));
  const inserted = await db
    .insert(items)
    .values(itemValues)
    .onConflictDoNothing({ target: items.sku })
    .returning({ id: items.id });

  // ---- Keep vendor.itemsCount in sync with actual rows ---------------------
  const counts = await db
    .select({ vendorId: items.vendorId, count: sql<number>`count(*)::int` })
    .from(items)
    .groupBy(items.vendorId);
  for (const c of counts) {
    if (c.vendorId) await db.update(vendors).set({ itemsCount: c.count }).where(eq(vendors.id, c.vendorId));
  }

  console.log(
    `Done. Vendors added: ${missingVendors.length}. Items inserted: ${inserted.length} (skipped ${ITEMS.length - inserted.length} existing).`,
  );
  process.exit(0);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
