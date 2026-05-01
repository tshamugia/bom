import { beforeEach, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";
import { resetDb, ensureOrg } from "@/../tests/test-helpers/db";
import { db } from "@/db/client";
import { items, vendors, categories, projects, bomRevisions, bomLines } from "@/db/schema";
import { addLine, updateLineQty, removeLine } from "@/server/actions/bom-lines";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/org", () => ({ getCurrentOrgId: vi.fn() }));
import { getCurrentOrgId } from "@/server/org";

beforeEach(async () => { await resetDb(); });

async function setup() {
  const org = await ensureOrg();
  vi.mocked(getCurrentOrgId).mockResolvedValue(org.id);
  const [v] = await db.insert(vendors).values({ name: "M", code: "M", country: "US", leadTime: "3d", rating: 4, status: "approved", organizationId: org.id }).returning();
  const [c] = await db.insert(categories).values({ name: "C", organizationId: org.id }).returning();
  const [it1] = await db.insert(items).values({ sku: "A", description: "a", manufacturer: "x", unit: "pcs", unitPrice: "2.000", onHand: 100, stockState: "in-stock", vendorId: v.id, categoryId: c.id, subcategoryId: null, organizationId: org.id }).returning();
  const [it2] = await db.insert(items).values({ sku: "B", description: "b", manufacturer: "x", unit: "pcs", unitPrice: "5.000", onHand: 100, stockState: "in-stock", vendorId: v.id, categoryId: c.id, subcategoryId: null, organizationId: org.id }).returning();
  const [p] = await db.insert(projects).values({ organizationId: org.id, code: "P", name: "P", status: "in-progress" }).returning();
  const [r] = await db.insert(bomRevisions).values({ projectId: p.id, letter: "A", status: "in-progress" }).returning();
  return { orgId: org.id, revisionId: r.id, it1, it2 };
}

test("addLine inserts a new line with price snapshot", async () => {
  const { revisionId, it1 } = await setup();
  const line = await addLine({ revisionId, itemId: it1.id });
  expect(line.qty).toBe(1);
  expect(line.unitPriceSnapshot).toBe("2.0000");
});

test("addLine called twice for same item increments qty (no duplicate row)", async () => {
  const { revisionId, it1 } = await setup();
  await addLine({ revisionId, itemId: it1.id });
  await addLine({ revisionId, itemId: it1.id });
  const rows = await db.select().from(bomLines);
  expect(rows).toHaveLength(1);
  expect(rows[0].qty).toBe(2);
});

test("updateLineQty sets the quantity", async () => {
  const { revisionId, it1 } = await setup();
  const line = await addLine({ revisionId, itemId: it1.id });
  await updateLineQty({ id: line.id, qty: 17 });
  const [row] = await db.select().from(bomLines).where(eq(bomLines.id, line.id));
  expect(row.qty).toBe(17);
});

test("removeLine deletes the row", async () => {
  const { revisionId, it1 } = await setup();
  const line = await addLine({ revisionId, itemId: it1.id });
  await removeLine({ id: line.id });
  const rows = await db.select().from(bomLines);
  expect(rows).toHaveLength(0);
});
