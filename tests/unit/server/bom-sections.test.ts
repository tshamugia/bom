import { beforeEach, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";
import { resetDb, ensureOrg } from "@/../tests/test-helpers/db";
import { db } from "@/db/client";
import {
  items,
  vendors,
  categories,
  projects,
  bomRevisions,
  bomSections,
  bomLines,
} from "@/db/schema";
import {
  createSection,
  renameSection,
  reorderSection,
  deleteSection,
  listSectionSuggestions,
} from "@/server/actions/bom-sections";
import { addLine } from "@/server/actions/bom-lines";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/org", () => ({ getCurrentOrgId: vi.fn(), requireSession: vi.fn() }));
import { getCurrentOrgId, requireSession } from "@/server/org";

beforeEach(async () => {
  await resetDb();
});

async function setup() {
  const org = await ensureOrg();
  vi.mocked(getCurrentOrgId).mockResolvedValue(org.id);
  vi.mocked(requireSession).mockResolvedValue({ user: { id: "u1", name: "Tester" } } as never);

  const [v] = await db
    .insert(vendors)
    .values({ name: "M", code: "M", country: "US", leadTime: "3d", rating: 4, status: "approved", organizationId: org.id })
    .returning();
  const [c] = await db.insert(categories).values({ name: "C", organizationId: org.id }).returning();
  const [it1] = await db
    .insert(items)
    .values({ sku: "A", description: "a", manufacturer: "x", unit: "pcs", unitPrice: "2.000", onHand: 100, stockState: "in-stock", vendorId: v.id, categoryId: c.id, subcategoryId: null, organizationId: org.id })
    .returning();
  const [it2] = await db
    .insert(items)
    .values({ sku: "B", description: "b", manufacturer: "x", unit: "pcs", unitPrice: "5.000", onHand: 100, stockState: "in-stock", vendorId: v.id, categoryId: c.id, subcategoryId: null, organizationId: org.id })
    .returning();
  const [p] = await db.insert(projects).values({ organizationId: org.id, code: "P", name: "P", status: "in-progress" }).returning();
  const [r] = await db
    .insert(bomRevisions)
    .values({ projectId: p.id, letter: "A", status: "in-progress" })
    .returning();
  return { orgId: org.id, projectId: p.id, revisionId: r.id, it1, it2 };
}

test("createSection inserts with auto-incremented position", async () => {
  const { revisionId } = await setup();
  const a = await createSection({ revisionId, name: "Fire Alarm" });
  const b = await createSection({ revisionId, name: "IT Network" });
  expect(a.position).toBe(0);
  expect(b.position).toBe(1);
});

test("renameSection updates the name", async () => {
  const { revisionId } = await setup();
  const a = await createSection({ revisionId, name: "Old" });
  await renameSection({ id: a.id, name: "New" });
  const [row] = await db.select().from(bomSections).where(eq(bomSections.id, a.id));
  expect(row.name).toBe("New");
});

test("reorderSection moves a section to a new index and rewrites siblings", async () => {
  const { revisionId } = await setup();
  const a = await createSection({ revisionId, name: "A" });
  const b = await createSection({ revisionId, name: "B" });
  const c = await createSection({ revisionId, name: "C" });

  // Move A to position 2 (last). Expected order: B, C, A.
  await reorderSection({ id: a.id, position: 2 });

  const rows = await db
    .select({ id: bomSections.id, position: bomSections.position, name: bomSections.name })
    .from(bomSections)
    .where(eq(bomSections.revisionId, revisionId))
    .orderBy(bomSections.position);
  expect(rows.map(r => r.name)).toEqual(["B", "C", "A"]);
  expect(rows.map(r => r.position)).toEqual([0, 1, 2]);
  // sanity: sibling positions ended up contiguous
  expect(rows.find(r => r.id === b.id)!.position).toBe(0);
  expect(rows.find(r => r.id === c.id)!.position).toBe(1);
});

test("deleteSection mode=moveToUncategorized: lines remain with sectionId=null", async () => {
  const { revisionId, it1, it2 } = await setup();
  const sec = await createSection({ revisionId, name: "Fire Alarm" });
  await addLine({ revisionId, itemId: it1.id, sectionId: sec.id });
  await addLine({ revisionId, itemId: it2.id, sectionId: sec.id });

  await deleteSection({ id: sec.id, mode: "moveToUncategorized" });

  const sections = await db.select().from(bomSections).where(eq(bomSections.revisionId, revisionId));
  expect(sections).toHaveLength(0);
  const lines = await db.select().from(bomLines).where(eq(bomLines.revisionId, revisionId));
  expect(lines).toHaveLength(2);
  expect(lines.every(l => l.sectionId === null)).toBe(true);
});

test("deleteSection mode=deleteLines: section AND its lines are removed", async () => {
  const { revisionId, it1, it2 } = await setup();
  const sec = await createSection({ revisionId, name: "Fire Alarm" });
  await addLine({ revisionId, itemId: it1.id, sectionId: sec.id });
  await addLine({ revisionId, itemId: it2.id, sectionId: sec.id });

  await deleteSection({ id: sec.id, mode: "deleteLines" });

  const sections = await db.select().from(bomSections).where(eq(bomSections.revisionId, revisionId));
  expect(sections).toHaveLength(0);
  const lines = await db.select().from(bomLines).where(eq(bomLines.revisionId, revisionId));
  expect(lines).toHaveLength(0);
});

test("section CRUD on locked revision is rejected", async () => {
  const { revisionId } = await setup();
  await db.update(bomRevisions).set({ status: "locked" }).where(eq(bomRevisions.id, revisionId));

  await expect(createSection({ revisionId, name: "Locked" })).rejects.toThrow(/REVISION_LOCKED/);
});

test("cross-org access to sections is rejected", async () => {
  const { revisionId } = await setup();
  const sec = await createSection({ revisionId, name: "Mine" });

  // Switch to a different org for the next call.
  const otherOrg = await ensureOrg("Other Org");
  vi.mocked(getCurrentOrgId).mockResolvedValue(otherOrg.id);

  await expect(renameSection({ id: sec.id, name: "Stolen" })).rejects.toThrow(/SECTION_NOT_FOUND/);
});

test("listSectionSuggestions returns names from sections in the user's org", async () => {
  const { revisionId } = await setup();
  await createSection({ revisionId, name: "Fire Alarm" });
  await createSection({ revisionId, name: "IT Network" });
  await createSection({ revisionId, name: "Fire Alarm" }); // duplicate name, different revision is unrealistic here but tests dedupe

  const suggestions = await listSectionSuggestions();
  expect(suggestions).toContain("Fire Alarm");
  expect(suggestions).toContain("IT Network");
  // First suggestion is the most-used name.
  expect(suggestions[0]).toBe("Fire Alarm");
});
