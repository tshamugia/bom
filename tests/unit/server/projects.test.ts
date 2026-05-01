import { beforeEach, expect, test, vi } from "vitest";
import { resetDb, ensureOrg } from "@/../tests/test-helpers/db";
import { db } from "@/db/client";
import { projects, bomRevisions, items, vendors, categories, bomLines } from "@/db/schema";
import { listProjects, getProject, getActiveRevision, getLines } from "@/server/queries/projects";

vi.mock("@/server/org", () => ({ getCurrentOrgId: vi.fn() }));
import { getCurrentOrgId } from "@/server/org";

beforeEach(async () => { await resetDb(); });

async function setup() {
  const org = await ensureOrg();
  vi.mocked(getCurrentOrgId).mockResolvedValue(org.id);

  const [v] = await db.insert(vendors).values({ name: "M", code: "M", country: "US", leadTime: "3d", rating: 4, status: "approved", organizationId: org.id }).returning();
  const [c] = await db.insert(categories).values({ name: "C", organizationId: org.id }).returning();
  const [it] = await db.insert(items).values({
    sku: "X-1", description: "x", manufacturer: "Y", unit: "pcs", unitPrice: "1.000",
    onHand: 10, stockState: "in-stock", vendorId: v.id, categoryId: c.id, subcategoryId: null, organizationId: org.id,
  }).returning();

  const [p] = await db.insert(projects).values({ organizationId: org.id, code: "P-1", name: "Project One", status: "in-progress" }).returning();
  const [r] = await db.insert(bomRevisions).values({ projectId: p.id, letter: "A", status: "in-progress" }).returning();
  await db.insert(bomLines).values({ revisionId: r.id, itemId: it.id, qty: 3, unitPriceSnapshot: "1.000", position: 0 });

  return { orgId: org.id, projectId: p.id, revId: r.id };
}

test("listProjects returns the project with line count and total", async () => {
  const { projectId } = await setup();
  const list = await listProjects();
  expect(list).toHaveLength(1);
  expect(list[0].id).toBe(projectId);
  expect(list[0].lineCount).toBe(1);
  expect(list[0].total).toBeCloseTo(3.0);
});

test("getProject hydrates project + active revision id", async () => {
  const { projectId, revId } = await setup();
  const p = await getProject(projectId);
  expect(p).not.toBeNull();
  expect(p!.activeRevisionId).toBe(revId);
});

test("getLines returns lines joined with item details", async () => {
  const { revId } = await setup();
  const lines = await getLines(revId);
  expect(lines).toHaveLength(1);
  expect(lines[0].sku).toBe("X-1");
  expect(lines[0].qty).toBe(3);
  expect(lines[0].vendorName).toBe("M");
});
