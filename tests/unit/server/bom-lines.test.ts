import { beforeEach, expect, test, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { resetDb, ensureOrg } from "@/../tests/test-helpers/db";
import { db } from "@/db/client";
import { items, vendors, categories, projects, bomRevisions, bomLines, bomSections } from "@/db/schema";
import { addLine, updateLineQty, removeLine, moveLineToSection } from "@/server/actions/bom-lines";
import { createSection } from "@/server/actions/bom-sections";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/org", () => ({ getCurrentOrgId: vi.fn(), requireSession: vi.fn() }));
import { getCurrentOrgId, requireSession } from "@/server/org";

beforeEach(async () => { await resetDb(); });

async function setup() {
  const org = await ensureOrg();
  vi.mocked(getCurrentOrgId).mockResolvedValue(org.id);
  vi.mocked(requireSession).mockResolvedValue({ user: { id: "u1", name: "Tester" } } as never);
  const [v] = await db.insert(vendors).values({ name: "M", code: "M", country: "US", leadTime: "3d", rating: 4, status: "approved", organizationId: org.id }).returning();
  const [c] = await db.insert(categories).values({ name: "C", organizationId: org.id }).returning();
  const [it1] = await db.insert(items).values({ sku: "A", description: "a", manufacturer: "x", unit: "pcs", unitPrice: "2.000", onHand: 100, stockState: "in-stock", vendorId: v.id, categoryId: c.id, subcategoryId: null, organizationId: org.id }).returning();
  const [it2] = await db.insert(items).values({ sku: "B", description: "b", manufacturer: "x", unit: "pcs", unitPrice: "5.000", onHand: 100, stockState: "in-stock", vendorId: v.id, categoryId: c.id, subcategoryId: null, organizationId: org.id }).returning();
  const [p] = await db.insert(projects).values({ organizationId: org.id, code: "P", name: "P", status: "draft" }).returning();
  const [r] = await db.insert(bomRevisions).values({ projectId: p.id, letter: "A", status: "draft" }).returning();
  return { orgId: org.id, revisionId: r.id, it1, it2 };
}

test("addLine inserts a new line with price snapshot", async () => {
  const { revisionId, it1 } = await setup();
  const line = await addLine({ revisionId, itemId: it1.id });
  expect(line.qty).toBe(1);
  expect(line.unitPriceSnapshot).toBe("2.0000");
});

test("addLine captures item + vendor snapshots", async () => {
  const { revisionId, it1 } = await setup();
  await addLine({ revisionId, itemId: it1.id, qty: 3 });
  const [row] = await db
    .select()
    .from(bomLines)
    .where(and(eq(bomLines.revisionId, revisionId), eq(bomLines.itemId, it1.id)));
  expect(row.skuSnapshot).toBe("A");
  expect(row.descriptionSnapshot).toBe("a");
  expect(row.manufacturerSnapshot).toBe("x");
  expect(row.unitSnapshot).toBe("pcs");
  expect(row.vendorNameSnapshot).toBe("M");
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

test("addLine with sectionId places the line in the section", async () => {
  const { revisionId, it1 } = await setup();
  const sec = await createSection({ revisionId, name: "Fire Alarm" });
  const line = await addLine({ revisionId, itemId: it1.id, sectionId: sec.id });
  expect(line.sectionId).toBe(sec.id);
});

test("addLine rejects a sectionId that belongs to a different revision", async () => {
  const { revisionId, it1 } = await setup();
  // Create a second revision with its own section.
  const orgId = (await getCurrentOrgId()) as string;
  const [p2] = await db.insert(projects).values({ organizationId: orgId, code: "P2", name: "P2", status: "draft" }).returning();
  const [r2] = await db.insert(bomRevisions).values({ projectId: p2.id, letter: "A", status: "draft" }).returning();
  const otherSection = await createSection({ revisionId: r2.id, name: "Other-rev section" });

  await expect(
    addLine({ revisionId, itemId: it1.id, sectionId: otherSection.id }),
  ).rejects.toThrow(/SECTION_NOT_IN_REVISION/);
});

test("moveLineToSection moves a line and rewrites positions in both source and dest", async () => {
  const { revisionId, it1, it2 } = await setup();
  const a = await createSection({ revisionId, name: "A" });
  const b = await createSection({ revisionId, name: "B" });

  // Source has 2 items; we'll move item-1 into the empty B section.
  const line1 = await addLine({ revisionId, itemId: it1.id, sectionId: a.id });
  const line2 = await addLine({ revisionId, itemId: it2.id, sectionId: a.id });
  expect(line1.position).toBe(0);
  expect(line2.position).toBe(1);

  await moveLineToSection({ lineId: line1.id, sectionId: b.id });

  // Source: only line2, position must be compacted to 0.
  const aLines = await db
    .select({ id: bomLines.id, position: bomLines.position })
    .from(bomLines)
    .where(and(eq(bomLines.revisionId, revisionId), eq(bomLines.sectionId, a.id)))
    .orderBy(bomLines.position);
  expect(aLines).toHaveLength(1);
  expect(aLines[0].id).toBe(line2.id);
  expect(aLines[0].position).toBe(0);

  // Dest: line1 at position 0.
  const bLines = await db
    .select({ id: bomLines.id, position: bomLines.position })
    .from(bomLines)
    .where(and(eq(bomLines.revisionId, revisionId), eq(bomLines.sectionId, b.id)))
    .orderBy(bomLines.position);
  expect(bLines).toHaveLength(1);
  expect(bLines[0].id).toBe(line1.id);
  expect(bLines[0].position).toBe(0);
});

test("moveLineToSection to null moves a line to Uncategorized", async () => {
  const { revisionId, it1 } = await setup();
  const a = await createSection({ revisionId, name: "A" });
  const line = await addLine({ revisionId, itemId: it1.id, sectionId: a.id });

  await moveLineToSection({ lineId: line.id, sectionId: null });

  const [row] = await db.select().from(bomLines).where(eq(bomLines.id, line.id));
  expect(row.sectionId).toBeNull();
});

test("blocks updateLineQty when revision is committed", async () => {
  const { revisionId, it1 } = await setup();
  const line = await addLine({ revisionId, itemId: it1.id });
  await db.update(bomRevisions).set({ status: "committed" }).where(eq(bomRevisions.id, revisionId));
  await expect(updateLineQty({ id: line.id, qty: 5 })).rejects.toThrow(/REVISION_LOCKED/);
});

test("blocks removeLine when revision is committed", async () => {
  const { revisionId, it1 } = await setup();
  const line = await addLine({ revisionId, itemId: it1.id });
  await db.update(bomRevisions).set({ status: "committed" }).where(eq(bomRevisions.id, revisionId));
  await expect(removeLine({ id: line.id })).rejects.toThrow(/REVISION_LOCKED/);
});

test("blocks moveLineToSection when revision is committed", async () => {
  const { revisionId, it1 } = await setup();
  const a = await createSection({ revisionId, name: "A" });
  const line = await addLine({ revisionId, itemId: it1.id, sectionId: a.id });
  await db.update(bomRevisions).set({ status: "committed" }).where(eq(bomRevisions.id, revisionId));
  await expect(moveLineToSection({ lineId: line.id, sectionId: null })).rejects.toThrow(/REVISION_LOCKED/);
});

test("blocks addLine when revision is committed", async () => {
  const { revisionId, it1 } = await setup();
  await db.update(bomRevisions).set({ status: "committed" }).where(eq(bomRevisions.id, revisionId));
  await expect(addLine({ revisionId, itemId: it1.id })).rejects.toThrow(/REVISION_LOCKED/);
});

test("moveLineToSection rejects a destination section from a different revision", async () => {
  const { revisionId, it1 } = await setup();
  const a = await createSection({ revisionId, name: "A" });
  const line = await addLine({ revisionId, itemId: it1.id, sectionId: a.id });

  // Create another revision and a section in it.
  const orgId = (await getCurrentOrgId()) as string;
  const [p2] = await db.insert(projects).values({ organizationId: orgId, code: "P2", name: "P2", status: "draft" }).returning();
  const [r2] = await db.insert(bomRevisions).values({ projectId: p2.id, letter: "A", status: "draft" }).returning();
  const [otherSec] = await db.insert(bomSections).values({ revisionId: r2.id, name: "Other", position: 0 }).returning();

  await expect(
    moveLineToSection({ lineId: line.id, sectionId: otherSec.id }),
  ).rejects.toThrow(/SECTION_NOT_IN_REVISION/);
});
