import { beforeEach, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";
import { resetDb } from "@/../tests/test-helpers/db";
import { mockSession } from "@/../tests/test-helpers/auth";
import { db } from "@/db/client";
import { items, vendors, categories, projects, boms, bomRevisions, bomLines, bomSections } from "@/db/schema";
import { createSection, renameSection } from "@/server/actions/bom-sections";
import { addLine, updateLineQty, removeLine } from "@/server/actions/bom-lines";
import { commitRevision, branchRevision } from "@/server/actions/revisions";
import { getRevisionDiff } from "@/server/queries/revisions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/auth-context", () => ({ requireSession: vi.fn(), requireRole: vi.fn() }));

beforeEach(async () => { await resetDb(); });

async function seed() {
  const { user: u } = await mockSession();
  const [v1] = await db.insert(vendors).values({ name: "V1", code: "V1", country: "US", leadTime: "3d", rating: 4, status: "approved" }).returning();
  const [v2] = await db.insert(vendors).values({ name: "V2", code: "V2", country: "US", leadTime: "3d", rating: 4, status: "approved" }).returning();
  const [c] = await db.insert(categories).values({ name: "C" }).returning();
  const it = async (sku: string, vendorId: string) =>
    (await db.insert(items).values({ sku, description: sku, manufacturer: "m", unit: "pcs", vendorId, categoryId: c.id, subcategoryId: null }).returning())[0];
  const a = await it("A", v1.id);
  const b = await it("B", v1.id);
  const cItem = await it("C", v2.id);
  const [p] = await db.insert(projects).values({ code: "P", name: "P" }).returning();
  const [bom] = await db.insert(boms).values({ projectId: p.id, name: "Main BOM" }).returning();
  const [r] = await db.insert(bomRevisions).values({ bomId: bom.id, letter: "A", status: "draft", ownerId: u.id }).returning();
  return { projectId: p.id, bomId: bom.id, leftId: r.id, a, b, c: cItem, v2 };
}

test("diff: added line shows up under added", async () => {
  const { leftId, a, b } = await seed();
  await addLine({ revisionId: leftId, itemId: a.id, qty: 1 });
  await commitRevision({ revisionId: leftId });
  const rightId = await branchRevision({ parentRevisionId: leftId });
  await addLine({ revisionId: rightId, itemId: b.id, qty: 3 });

  const diff = await getRevisionDiff(leftId, rightId);
  expect(diff.lines.added).toHaveLength(1);
  expect(diff.lines.added[0].sku).toBe("B");
  expect(diff.lines.added[0].qty).toBe(3);
  expect(diff.lines.removed).toHaveLength(0);
  expect(diff.lines.changed).toHaveLength(0);
});

test("diff: qty change shows under changed with from->to", async () => {
  const { leftId, a } = await seed();
  await addLine({ revisionId: leftId, itemId: a.id, qty: 1 });
  await commitRevision({ revisionId: leftId });
  const rightId = await branchRevision({ parentRevisionId: leftId });
  const [line] = await db.select().from(bomLines).where(eq(bomLines.revisionId, rightId));
  await updateLineQty({ id: line.id, qty: 5 });
  const diff = await getRevisionDiff(leftId, rightId);
  expect(diff.lines.changed).toHaveLength(1);
  expect(diff.lines.changed[0].changes.qty).toEqual({ from: 1, to: 5 });
});

test("diff: removed line shows up under removed", async () => {
  const { leftId, a, b } = await seed();
  await addLine({ revisionId: leftId, itemId: a.id, qty: 1 });
  await addLine({ revisionId: leftId, itemId: b.id, qty: 1 });
  await commitRevision({ revisionId: leftId });
  const rightId = await branchRevision({ parentRevisionId: leftId });
  const [line] = await db
    .select().from(bomLines)
    .where(eq(bomLines.revisionId, rightId))
    .limit(1);
  await removeLine({ id: line.id });
  const diff = await getRevisionDiff(leftId, rightId);
  expect(diff.lines.removed).toHaveLength(1);
});

test("diff: section rename detected via sectionKey", async () => {
  const { leftId, a } = await seed();
  const sec = await createSection({ revisionId: leftId, name: "Power" });
  await addLine({ revisionId: leftId, itemId: a.id, qty: 1, sectionId: sec.id });
  await commitRevision({ revisionId: leftId });
  const rightId = await branchRevision({ parentRevisionId: leftId });
  const [childSec] = await db.select().from(bomSections).where(eq(bomSections.revisionId, rightId));
  await renameSection({ id: childSec.id, name: "PSU" });
  const diff = await getRevisionDiff(leftId, rightId);
  expect(diff.sections.renamed).toEqual([{ from: "Power", to: "PSU" }]);
  expect(diff.sections.added).toHaveLength(0);
  expect(diff.sections.removed).toHaveLength(0);
});
