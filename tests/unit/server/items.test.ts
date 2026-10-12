import { beforeEach, expect, test, vi } from "vitest";
import { resetDb } from "@/../tests/test-helpers/db";
import { mockSession } from "@/../tests/test-helpers/auth";
import { db } from "@/db/client";
import { auditLog, categories, items as itemsTable, subcategories, vendors } from "@/db/schema";
import { eq } from "drizzle-orm";
import { listItems } from "@/server/queries/catalog";
import { createItem, deleteItem, updateItem } from "@/server/actions/items";
import { READ_ONLY_ERROR } from "@/lib/roles";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/auth-context", () => ({
  requireSession: vi.fn(),
  requireRole: vi.fn(),
}));

beforeEach(async () => { await resetDb(); });

async function setup() {
  await mockSession();
  const [v] = await db.insert(vendors).values({ name: "Mouser", code: "MSR", country: "US", leadTime: "3-5d", rating: 4.8, status: "preferred" }).returning();
  const [c] = await db.insert(categories).values({ name: "Passive Components" }).returning();
  return { vendorId: v.id, categoryId: c.id };
}

test("createItem persists and listItems returns it", async () => {
  const { vendorId, categoryId } = await setup();
  await createItem({ sku: "RES-1", description: "10k", manufacturer: "Yageo", unit: "pcs", vendorId, categoryId, subcategoryId: null });
  const items = await listItems({});
  expect(items).toHaveLength(1);
  expect(items[0].sku).toBe("RES-1");
});

test("listItems filters by search term across sku/desc/mfr", async () => {
  const { vendorId, categoryId } = await setup();
  await createItem({ sku: "RES-1", description: "10k resistor", manufacturer: "Yageo", unit: "pcs", vendorId, categoryId, subcategoryId: null });
  await createItem({ sku: "CAP-1", description: "100nF cap",   manufacturer: "Murata", unit: "pcs", vendorId, categoryId, subcategoryId: null });
  expect((await listItems({ search: "yageo" })).map(i => i.sku)).toEqual(["RES-1"]);
  expect((await listItems({ search: "100n" })).map(i => i.sku)).toEqual(["CAP-1"]);
});

test("deleteItem removes it", async () => {
  const { vendorId, categoryId } = await setup();
  const it = await createItem({ sku: "RES-1", description: "10k", manufacturer: "Yageo", unit: "pcs", vendorId, categoryId, subcategoryId: null });
  if (!it.ok) throw new Error(it.error);
  await deleteItem({ id: it.id });
  expect(await listItems({})).toHaveLength(0);
});

const base = { description: "10k", manufacturer: "Yageo", unit: "pcs", subcategoryId: null };

test("createItem refuses a SKU that is already in the catalog", async () => {
  const { vendorId, categoryId } = await setup();
  await createItem({ sku: "RES-1", ...base, vendorId, categoryId });
  expect(await createItem({ sku: "RES-1", ...base, vendorId, categoryId }))
    .toEqual({ ok: false, error: "SKU RES-1 is already in the catalog." });
});

test("updateItem edits the item and audits the changed fields", async () => {
  const { vendorId, categoryId } = await setup();
  const it = await createItem({ sku: "RES-1", ...base, vendorId, categoryId });
  if (!it.ok) throw new Error(it.error);

  expect(await updateItem({ id: it.id, sku: " RES-1A ", description: "10k 1%", manufacturer: "Yageo", unit: "pcs", vendorId: null, categoryId }))
    .toEqual({ ok: true, id: it.id });
  const [row] = await listItems({});
  expect(row).toMatchObject({ sku: "RES-1A", description: "10k 1%", vendorId: null, categoryId });

  const [entry] = await db.select().from(auditLog).where(eq(auditLog.kind, "item.updated"));
  expect(entry.summary).toBe("Item RES-1 → RES-1A updated");
  expect(entry.payload).toEqual({ fields: ["sku", "description", "vendorId"] });
});

test("updateItem refuses a SKU used by another item", async () => {
  const { vendorId, categoryId } = await setup();
  await createItem({ sku: "RES-1", ...base, vendorId, categoryId });
  const cap = await createItem({ sku: "CAP-1", ...base, vendorId, categoryId });
  if (!cap.ok) throw new Error(cap.error);
  expect(await updateItem({ id: cap.id, sku: "RES-1" }))
    .toEqual({ ok: false, error: "SKU RES-1 is already used by another item." });
});

test("updateItem drops the subcategory when the item moves to another category", async () => {
  const { vendorId, categoryId } = await setup();
  const [sub] = await db.insert(subcategories).values({ categoryId, name: "Resistors" }).returning();
  const [other] = await db.insert(categories).values({ name: "Cables" }).returning();
  const it = await createItem({ sku: "RES-1", ...base, vendorId, categoryId, subcategoryId: sub.id });
  if (!it.ok) throw new Error(it.error);

  await updateItem({ id: it.id, description: "10k resistor" });
  expect((await db.select().from(itemsTable).where(eq(itemsTable.id, it.id)))[0].subcategoryId).toBe(sub.id);

  await updateItem({ id: it.id, categoryId: other.id });
  const [row] = await db.select().from(itemsTable).where(eq(itemsTable.id, it.id));
  expect(row).toMatchObject({ categoryId: other.id, subcategoryId: null });
});

test("viewers can't edit items", async () => {
  const { vendorId, categoryId } = await setup();
  const it = await createItem({ sku: "RES-1", ...base, vendorId, categoryId });
  if (!it.ok) throw new Error(it.error);
  await mockSession("viewer");
  expect(await updateItem({ id: it.id, description: "changed" })).toEqual({ ok: false, error: READ_ONLY_ERROR });
});
