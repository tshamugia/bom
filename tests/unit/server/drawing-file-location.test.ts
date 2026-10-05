import { beforeEach, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";
import { resetDb } from "@/../tests/test-helpers/db";
import { mockSession } from "@/../tests/test-helpers/auth";
import { db } from "@/db/client";
import { drawingDisciplines, drawingEvents, drawings, projects } from "@/db/schema";
import { createDrawing, updateDrawing } from "@/server/actions/drawings";
import { getDrawing } from "@/server/queries/drawings";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/server/auth-context", () => ({ requireSession: vi.fn(), requireRole: vi.fn() }));

beforeEach(async () => { await resetDb(); });

async function setup() {
  const { user } = await mockSession("member");
  const [p] = await db.insert(projects).values({ code: "P-1", name: "BMW showroom" }).returning();
  const [d] = await db.insert(drawingDisciplines).values({ name: `CCTV ${Date.now()}` }).returning();
  const fields = {
    projectId: p.id, name: "Ground floor cameras", disciplineId: d.id,
    ownerId: user.id, dueDate: null, estimatedHours: null,
  };
  return { fields };
}

test("a drawing keeps its file-server location, trimmed", async () => {
  const { fields } = await setup();
  const r = await createDrawing({ ...fields, fileLocation: "  2026/BMW/CCTV  " });
  if (!r.ok) throw new Error(r.error);

  expect((await getDrawing(r.id))?.fileLocation).toBe("2026/BMW/CCTV");
});

test("changing the location is recorded in the history, and a blank clears it", async () => {
  const { fields } = await setup();
  const r = await createDrawing(fields);
  if (!r.ok) throw new Error(r.error);
  expect((await getDrawing(r.id))?.fileLocation).toBeNull();

  expect(await updateDrawing({ ...fields, id: r.id, fileLocation: "2026/BMW/CCTV" })).toEqual({ ok: true });
  expect(await updateDrawing({ ...fields, id: r.id, fileLocation: "   " })).toEqual({ ok: true });

  const [row] = await db.select({ fileLocation: drawings.fileLocation }).from(drawings).where(eq(drawings.id, r.id));
  expect(row.fileLocation).toBeNull();
  const updates = await db
    .select({ body: drawingEvents.body })
    .from(drawingEvents)
    .where(eq(drawingEvents.drawingId, r.id))
    .orderBy(drawingEvents.createdAt);
  expect(updates.map(e => e.body).filter(Boolean)).toEqual([
    "File location: — → 2026/BMW/CCTV",
    "File location: 2026/BMW/CCTV → —",
  ]);
});
