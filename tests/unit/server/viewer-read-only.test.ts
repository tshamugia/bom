import { beforeEach, expect, test, vi } from "vitest";
import { resetDb, ensureUser } from "@/../tests/test-helpers/db";
import { mockSession } from "@/../tests/test-helpers/auth";
import { db } from "@/db/client";
import { drawingDisciplines, projects } from "@/db/schema";
import { READ_ONLY_ERROR } from "@/lib/roles";
import { listProjects } from "@/server/queries/projects";
import { createProject } from "@/server/actions/projects";
import { createVendor } from "@/server/actions/vendors";
import { deleteProjectContact } from "@/server/actions/project-passport";
import { addDrawingRemark } from "@/server/actions/drawing-remarks";
import { createDrawing } from "@/server/actions/drawings";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/server/auth-context", () => ({ requireSession: vi.fn(), requireRole: vi.fn() }));

beforeEach(async () => { await resetDb(); });

test("a viewer can read but throwing actions reject with FORBIDDEN", async () => {
  await db.insert(projects).values({ code: "P-1", name: "Project One" });
  await mockSession("viewer");

  expect(await listProjects()).toHaveLength(1);
  await expect(createProject({ name: "Two" })).rejects.toThrow(/FORBIDDEN/);
  await expect(
    createVendor({ name: "V", code: "V", country: "US", leadTime: "3d", rating: 4, status: "approved" }),
  ).rejects.toThrow(/FORBIDDEN/);
  expect(await listProjects()).toHaveLength(1);
});

test("{ ok, error } actions return the read-only error for a viewer", async () => {
  await mockSession("viewer");

  expect(await deleteProjectContact({ id: "missing" })).toEqual({ ok: false, error: READ_ONLY_ERROR });
  expect(await addDrawingRemark({ revisionId: "missing", source: "internal", body: "x" }))
    .toEqual({ ok: false, error: READ_ONLY_ERROR });
});

test("a member can't make a viewer the owner of a drawing", async () => {
  await mockSession("member");
  const viewer = await ensureUser("viewer");
  const [p] = await db.insert(projects).values({ code: "P-1", name: "Project One" }).returning();
  const [d] = await db.insert(drawingDisciplines).values({ name: `Viewer test ${Date.now()}` }).returning();

  const r = await createDrawing({
    projectId: p.id, name: "Single line", disciplineId: d.id,
    ownerId: viewer.id, dueDate: null, estimatedHours: null,
  });
  expect(r).toEqual({ ok: false, error: "The owner must be an active user who isn't a viewer." });
});
