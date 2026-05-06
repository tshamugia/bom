import { beforeEach, expect, test, vi } from "vitest";
import { resetDb } from "@/../tests/test-helpers/db";
import { mockSession } from "@/../tests/test-helpers/auth";
import { db } from "@/db/client";
import { categories, vendors } from "@/db/schema";
import { listItems } from "@/server/queries/catalog";
import { createItem, deleteItem } from "@/server/actions/items";

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
  await deleteItem({ id: it.id });
  expect(await listItems({})).toHaveLength(0);
});
