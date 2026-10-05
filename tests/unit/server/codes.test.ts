import { beforeEach, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";
import { resetDb } from "@/../tests/test-helpers/db";
import { mockSession } from "@/../tests/test-helpers/auth";
import { db } from "@/db/client";
import { drawingDisciplines, drawingEvents, drawings, projects } from "@/db/schema";
import { createProject, softDeleteProject, suggestProjectCode, updateProject } from "@/server/actions/projects";
import { saveProjectPassport } from "@/server/actions/project-passport";
import { createDrawing, deleteDrawing, suggestDrawingCode, updateDrawing } from "@/server/actions/drawings";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/server/auth-context", () => ({ requireSession: vi.fn(), requireRole: vi.fn() }));

beforeEach(async () => { await resetDb(); });

const codeOf = async (id: string) =>
  (await db.select({ code: projects.code }).from(projects).where(eq(projects.id, id)))[0].code;

// ── Projects ─────────────────────────────────────────

test("a new project gets its code from the name and the next free number", async () => {
  await mockSession("member");
  await db.insert(projects).values({ code: "BS-004", name: "Old, typed by hand" });

  expect(await suggestProjectCode({ name: "BMW showroom" })).toBe("BS-005");
  const p = await createProject({ name: "BMW showroom" });
  expect(p.code).toBe("BS-005");
  expect((await createProject({ name: "Hilton" })).code).toBe("HIL-001");
  expect((await createProject({ name: "აღობილი" })).code).toBe("AGH-001");
  expect(await suggestProjectCode({ name: "  " })).toBe("");
});

test("archived projects keep their number", async () => {
  await mockSession("admin");
  const first = await createProject({ name: "Hilton" });
  await softDeleteProject({ id: first.id });
  expect((await createProject({ name: "Hilton" })).code).toBe("HIL-002");
});

test("two projects created at once don't share a code", async () => {
  await mockSession("member");
  const made = await Promise.all([1, 2, 3, 4].map(() => createProject({ name: "Hilton" })));
  expect(made.map(p => p.code).sort()).toEqual(["HIL-001", "HIL-002", "HIL-003", "HIL-004"]);
});

test("renaming a project keeps its code", async () => {
  const { user } = await mockSession("member");
  const p = await createProject({ name: "Hilton" });

  await updateProject({ id: p.id, name: "Radisson" });
  expect(await saveProjectPassport({
    id: p.id, name: "Radisson Blu", ownerId: user.id,
    clientName: null, contractNo: null, siteAddress: null, description: null, startDate: null, targetDate: null,
  })).toEqual({ ok: true });
  expect(await codeOf(p.id)).toBe("HIL-001");
});

test("a viewer can't ask for a project code", async () => {
  await mockSession("viewer");
  await expect(suggestProjectCode({ name: "Hilton" })).rejects.toThrow(/FORBIDDEN/);
});

// ── Drawings ─────────────────────────────────────────

async function drawingSetup() {
  const { user } = await mockSession("admin");
  const [a] = await db.insert(projects).values({ code: "P-1", name: "BMW showroom" }).returning();
  const [b] = await db.insert(projects).values({ code: "P-2", name: "Hilton" }).returning();
  const [d] = await db.insert(drawingDisciplines).values({ name: `CCTV ${Date.now()}` }).returning();
  const fields = (projectId: string, name: string) => ({
    projectId, name, disciplineId: d.id, ownerId: user.id, dueDate: null, estimatedHours: null,
  });
  const create = async (projectId: string, name: string) => {
    const r = await createDrawing(fields(projectId, name));
    if (!r.ok) throw new Error(r.error);
    return r;
  };
  return { a: a.id, b: b.id, fields, create };
}

const drawingCode = async (id: string) =>
  (await db.select({ code: drawings.code }).from(drawings).where(eq(drawings.id, id)))[0].code;

test("drawing codes come from the name and are numbered within the project", async () => {
  const { a, b, create } = await drawingSetup();

  expect(await suggestDrawingCode({ projectId: a, name: "Ground floor CCTV layout" })).toBe("GFCL-001");
  expect((await create(a, "Ground floor CCTV layout")).code).toBe("GFCL-001");
  expect((await create(a, "Ground floor cable layout")).code).toBe("GFCL-002");
  expect((await create(b, "Ground floor CCTV layout")).code).toBe("GFCL-001");
  expect((await create(a, "სახანძრო სიგნალიზაცია")).code).toBe("SS-001");
  expect(await suggestDrawingCode({ projectId: "", name: "Riser" })).toBe("");
});

test("an archived drawing's number isn't handed out again", async () => {
  const { a, create } = await drawingSetup();
  const first = await create(a, "Riser");
  expect(await deleteDrawing({ id: first.id })).toEqual({ ok: true });
  expect((await create(a, "Riser")).code).toBe("RIS-002");
});

test("drawings created at once in one project get different codes", async () => {
  const { a, create } = await drawingSetup();
  const made = await Promise.all([1, 2, 3].map(() => create(a, "Riser")));
  expect(made.map(d => d.code).sort()).toEqual(["RIS-001", "RIS-002", "RIS-003"]);
});

test("renaming a drawing keeps its code", async () => {
  const { a, fields, create } = await drawingSetup();
  const d = await create(a, "Riser");
  expect(await updateDrawing({ ...fields(a, "Fire alarm riser"), id: d.id })).toEqual({ ok: true });
  expect(await drawingCode(d.id)).toBe("RIS-001");
});

test("moving a drawing keeps its code unless the new project already uses it", async () => {
  const { a, b, fields, create } = await drawingSetup();
  const moving = await create(a, "Riser");
  const other = await create(a, "Single line");

  // Free in project B: unchanged.
  expect(await suggestDrawingCode({ projectId: b, name: "Riser", drawingId: moving.id })).toBe("RIS-001");
  expect(await updateDrawing({ ...fields(b, "Riser"), id: moving.id })).toEqual({ ok: true });
  expect(await drawingCode(moving.id)).toBe("RIS-001");

  // B already has an SL-001, so the move takes the next one from the name.
  await create(b, "Site layout");
  expect(await suggestDrawingCode({ projectId: b, name: "Single line", drawingId: other.id })).toBe("SL-002");
  expect(await updateDrawing({ ...fields(b, "Single line"), id: other.id })).toEqual({ ok: true });
  expect(await drawingCode(other.id)).toBe("SL-002");

  const [event] = await db
    .select({ body: drawingEvents.body })
    .from(drawingEvents)
    .where(eq(drawingEvents.drawingId, other.id))
    .orderBy(drawingEvents.createdAt)
    .offset(1);
  expect(event.body).toBe("Code: SL-001 → SL-002\nProject: P-1 → P-2");
});

test("a viewer gets no drawing code suggestion", async () => {
  const { a } = await drawingSetup();
  await mockSession("viewer");
  expect(await suggestDrawingCode({ projectId: a, name: "Riser" })).toBe("");
});
