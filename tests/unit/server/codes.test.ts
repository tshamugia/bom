import { beforeEach, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";
import { resetDb } from "@/../tests/test-helpers/db";
import { mockSession } from "@/../tests/test-helpers/auth";
import { db } from "@/db/client";
import { auditLog, drawingDisciplines, drawingEvents, drawings, projects } from "@/db/schema";
import { projectCodeYear } from "@/lib/codes";
import { ADMIN_ONLY_ERROR } from "@/lib/roles";
import { checkProjectCode, createProject, softDeleteProject, updateProject } from "@/server/actions/projects";
import { saveProjectPassport } from "@/server/actions/project-passport";
import { createDrawing, deleteDrawing, suggestDrawingCode, updateDrawing } from "@/server/actions/drawings";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/server/auth-context", () => ({ requireSession: vi.fn(), requireRole: vi.fn() }));

beforeEach(async () => { await resetDb(); });

const codeOf = async (id: string) =>
  (await db.select({ code: projects.code }).from(projects).where(eq(projects.id, id)))[0].code;

// ── Projects ─────────────────────────────────────────

const YY = projectCodeYear();
const passport = (id: string, ownerId: string, code?: string) => ({
  id, code, name: "BMW showroom", ownerId,
  clientName: null, contractNo: null, siteAddress: null, description: null, startDate: null, targetDate: null,
});

test("a new project gets this year and three letters from its name", async () => {
  await mockSession("member");
  expect(await checkProjectCode({ name: "Tegeta Motors" })).toEqual({ code: `${YY}TGT`, taken: false, alternative: null });
  expect((await createProject({ name: "თეგეტა მოტორს" })).code).toBe(`${YY}TGT`);
  expect((await createProject({ name: "BMW showroom", codeYear: "25" })).code).toBe("25BMW");
  expect((await createProject({ name: "Hilton", codeLetters: "hlx" })).code).toBe(`${YY}HLX`);
  expect(await checkProjectCode({ name: "  " })).toBeNull();
});

test("a taken code is refused when typed and skipped when suggested — archived projects count", async () => {
  await mockSession("admin");
  const first = await createProject({ name: "Hilton", codeYear: "26" });
  expect(first.code).toBe("26HLT");
  await softDeleteProject({ id: first.id });

  expect(await checkProjectCode({ name: "Hilton", year: "26" })).toEqual({ code: "26HLT", taken: true, alternative: "26HLN" });
  await expect(createProject({ name: "Hilton", codeYear: "26", codeLetters: "HLT" })).rejects.toThrow(/26HLT is already used/);
  expect((await createProject({ name: "Hilton", codeYear: "26" })).code).toBe("26HLN");
});

test("two projects created at once don't share a code", async () => {
  await mockSession("member");
  const made = await Promise.all([1, 2, 3, 4].map(() => createProject({ name: "Hilton", codeYear: "26" })));
  const codes = made.map(p => p.code);
  expect(new Set(codes).size).toBe(4);
  expect(codes).toContain("26HLT");
});

test("renaming a project keeps its code", async () => {
  const { user } = await mockSession("member");
  const p = await createProject({ name: "Hilton" });

  await updateProject({ id: p.id, name: "Radisson" });
  expect(await saveProjectPassport({ ...passport(p.id, user.id), name: "Radisson Blu" })).toEqual({ ok: true });
  expect(await codeOf(p.id)).toBe(`${YY}HLT`);
});

test("only an admin changes a project code, and only to a free standard one", async () => {
  const { user } = await mockSession("member");
  const [legacy] = await db.insert(projects).values({ code: "BS-005", name: "BMW showroom", ownerId: user.id }).returning();
  await db.insert(projects).values({ code: "25BMW", name: "Another BMW" });

  expect(await saveProjectPassport(passport(legacy.id, user.id, "25BMX"))).toEqual({ ok: false, error: ADMIN_ONLY_ERROR });
  // Keeping the old code is not a change, so members still save the passport.
  expect(await saveProjectPassport(passport(legacy.id, user.id, "BS-005"))).toEqual({ ok: true });

  await mockSession("admin");
  expect((await saveProjectPassport(passport(legacy.id, user.id, "BMW25"))).ok).toBe(false);
  expect(await saveProjectPassport(passport(legacy.id, user.id, "25BMW"))).toMatchObject({ ok: false, error: expect.stringMatching(/already used/) });
  expect(await saveProjectPassport(passport(legacy.id, user.id, "25bmx"))).toEqual({ ok: true });
  expect(await codeOf(legacy.id)).toBe("25BMX");

  const [row] = await db.select().from(auditLog).where(eq(auditLog.kind, "project.code.changed"));
  expect(row.payload).toMatchObject({ projectId: legacy.id, from: "BS-005", to: "25BMX" });
});

test("a viewer can't check a project code", async () => {
  await mockSession("viewer");
  await expect(checkProjectCode({ name: "Hilton" })).rejects.toThrow(/FORBIDDEN/);
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
