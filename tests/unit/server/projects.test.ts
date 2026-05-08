import { beforeEach, expect, test, vi } from "vitest";
import { resetDb } from "@/../tests/test-helpers/db";
import { mockSession } from "@/../tests/test-helpers/auth";
import { db } from "@/db/client";
import { projects, boms, bomRevisions, items, vendors, categories, bomLines } from "@/db/schema";
import { listProjects, getProject, getLines } from "@/server/queries/projects";
import { softDeleteProject, restoreProject } from "@/server/actions/projects";

vi.mock("@/server/auth-context", () => ({ requireSession: vi.fn(), requireRole: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

beforeEach(async () => { await resetDb(); });

async function setup() {
  await mockSession();

  const [v] = await db.insert(vendors).values({ name: "M", code: "M", country: "US", leadTime: "3d", rating: 4, status: "approved" }).returning();
  const [c] = await db.insert(categories).values({ name: "C" }).returning();
  const [it] = await db.insert(items).values({
    sku: "X-1", description: "x", manufacturer: "Y", unit: "pcs",
    vendorId: v.id, categoryId: c.id, subcategoryId: null,
  }).returning();

  const [p] = await db.insert(projects).values({ code: "P-1", name: "Project One" }).returning();
  const [b] = await db.insert(boms).values({ projectId: p.id, name: "Main BOM" }).returning();
  const [r] = await db.insert(bomRevisions).values({ bomId: b.id, letter: "A", status: "in-progress" }).returning();
  await db.insert(bomLines).values({ revisionId: r.id, itemId: it.id, qty: 3, position: 0 });

  return { projectId: p.id, bomId: b.id, revId: r.id };
}

test("listProjects returns the project with line count and bom count", async () => {
  const { projectId } = await setup();
  const list = await listProjects();
  expect(list).toHaveLength(1);
  expect(list[0].id).toBe(projectId);
  expect(list[0].lineCount).toBe(1);
  expect(list[0].bomCount).toBe(1);
});

test("getProject hydrates the project record", async () => {
  const { projectId } = await setup();
  const p = await getProject(projectId);
  expect(p).not.toBeNull();
  expect(p!.id).toBe(projectId);
});

test("getLines returns lines joined with item details", async () => {
  const { revId } = await setup();
  const lines = await getLines(revId);
  expect(lines).toHaveLength(1);
  expect(lines[0].sku).toBe("X-1");
  expect(lines[0].qty).toBe(3);
  expect(lines[0].vendorName).toBe("M");
});

test("softDeleteProject hides project from listings; restoreProject brings it back", async () => {
  const { projectId } = await setup();
  await softDeleteProject({ id: projectId });
  expect(await listProjects()).toHaveLength(0);
  expect(await getProject(projectId)).toBeNull();

  await restoreProject({ id: projectId });
  const list = await listProjects();
  expect(list).toHaveLength(1);
  expect(list[0].id).toBe(projectId);
});
