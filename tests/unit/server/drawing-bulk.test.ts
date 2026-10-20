import { beforeEach, expect, test, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { resetDb, ensureUser } from "@/../tests/test-helpers/db";
import { mockSession } from "@/../tests/test-helpers/auth";
import { db } from "@/db/client";
import { auditLog, drawingDisciplines, drawingEvents, drawingRevisions, drawings, projects } from "@/db/schema";
import { READ_ONLY_ERROR } from "@/lib/roles";
import { TRANSITION_ERROR_MESSAGE } from "@/lib/drawing-status";
import {
  bulkChangeDrawingStatus,
  bulkSetDrawingDueDate,
  bulkSetDrawingOwner,
  changeDrawingStatus,
  createDrawing,
  deleteDrawing,
} from "@/server/actions/drawings";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/server/auth-context", () => ({ requireSession: vi.fn(), requireRole: vi.fn() }));

beforeEach(async () => { await resetDb(); });

async function setup(count = 3) {
  const { user: me } = await mockSession("member");
  const [p] = await db.insert(projects).values({ code: "BS-001", name: "BMW showroom" }).returning();
  const [d] = await db.insert(drawingDisciplines).values({ name: `CCTV ${Date.now()}` }).returning();
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const r = await createDrawing({
      projectId: p.id, name: `Floor ${i + 1} cameras`, disciplineId: d.id,
      ownerId: me.id, dueDate: null, estimatedHours: null,
    });
    if (!r.ok) throw new Error(r.error);
    ids.push(r.id);
  }
  return { me, ids };
}

const statusOf = async (id: string) =>
  (await db.select({ status: drawingRevisions.status }).from(drawingRevisions).where(eq(drawingRevisions.drawingId, id)))[0].status;

const revisionOf = async (id: string) =>
  (await db.select({ id: drawingRevisions.id }).from(drawingRevisions).where(eq(drawingRevisions.drawingId, id)))[0].id;

test("a status reaches every selected drawing, each with its own history and audit row", async () => {
  const { ids } = await setup();

  const r = await bulkChangeDrawingStatus({ ids, to: "paused", comment: "Waiting for the client" });
  expect(r).toEqual({ ok: true, updated: expect.arrayContaining(ids), skipped: [] });

  for (const id of ids) expect(await statusOf(id)).toBe("paused");
  const events = await db
    .select({ body: drawingEvents.body })
    .from(drawingEvents)
    .where(inArray(drawingEvents.drawingId, ids));
  expect(events.filter(e => e.body === "Waiting for the client")).toHaveLength(3);
  const audits = await db.select().from(auditLog).where(eq(auditLog.kind, "drawing.status.changed"));
  expect(audits).toHaveLength(3);
});

test("drawings that can't move are skipped with the reason, the rest still change", async () => {
  const { ids } = await setup();
  const reviewer = await ensureUser("member");
  // The first one is already paused; Approved A needs the internal check on all of them.
  await bulkChangeDrawingStatus({ ids: [ids[0]], to: "paused" });

  const paused = await bulkChangeDrawingStatus({ ids, to: "paused" });
  if (!paused.ok) throw new Error(paused.error);
  expect(paused.updated.sort()).toEqual([ids[1], ids[2]].sort());
  expect(paused.skipped).toEqual([expect.objectContaining({ id: ids[0], reason: "Already Paused." })]);

  const approved = await bulkChangeDrawingStatus({ ids, to: "approved-a" });
  if (!approved.ok) throw new Error(approved.error);
  expect(approved.updated).toEqual([]);
  expect(approved.skipped.map(s => s.reason)).toEqual(Array(3).fill(TRANSITION_ERROR_MESSAGE.REVIEW_REQUIRED));

  // An approval request goes to one engineer for all of them…
  const requested = await bulkChangeDrawingStatus({ ids, to: "need-approval", reviewerId: reviewer.id });
  if (!requested.ok) throw new Error(requested.error);
  expect(requested.updated).toHaveLength(3);

  // …who can approve them together, but nobody else can.
  const notReviewer = await bulkChangeDrawingStatus({ ids, to: "awaiting-approval" });
  if (!notReviewer.ok) throw new Error(notReviewer.error);
  expect(notReviewer.updated).toEqual([]);

  const { requireSession } = await import("@/server/auth-context");
  vi.mocked(requireSession).mockResolvedValue({ user: { ...reviewer }, session: { id: "s", userId: reviewer.id } } as never);
  const approve = await bulkChangeDrawingStatus({ ids, to: "awaiting-approval" });
  if (!approve.ok) throw new Error(approve.error);
  expect(approve.updated).toHaveLength(3);
  for (const id of ids) expect(await statusOf(id)).toBe("awaiting-approval");
});

test("an approval request needs an engineer who isn't the requester", async () => {
  const { me, ids } = await setup(1);
  expect(await bulkChangeDrawingStatus({ ids, to: "need-approval" }))
    .toEqual({ ok: false, error: TRANSITION_ERROR_MESSAGE.REVIEWER_REQUIRED });
  expect(await bulkChangeDrawingStatus({ ids, to: "need-approval", reviewerId: me.id }))
    .toEqual({ ok: false, error: TRANSITION_ERROR_MESSAGE.REVIEWER_IS_REQUESTER });
  expect(await statusOf(ids[0])).toBe("in-progress");
});

test("owner changes skip the drawing's approving engineer and record the old owner", async () => {
  const { ids } = await setup(2);
  const other = await ensureUser("member");
  // `other` is asked to approve the first drawing, so they can't own it.
  const req = await changeDrawingStatus({ revisionId: await revisionOf(ids[0]), to: "need-approval", reviewerId: other.id });
  expect(req).toEqual({ ok: true });

  const r = await bulkSetDrawingOwner({ ids, ownerId: other.id });
  if (!r.ok) throw new Error(r.error);
  expect(r.updated).toEqual([ids[1]]);
  expect(r.skipped).toEqual([expect.objectContaining({ id: ids[0] })]);

  const [row] = await db.select({ ownerId: drawings.ownerId }).from(drawings).where(eq(drawings.id, ids[1]));
  expect(row.ownerId).toBe(other.id);
  const [event] = await db
    .select({ body: drawingEvents.body })
    .from(drawingEvents)
    .where(eq(drawingEvents.kind, "updated"));
  expect(event.body).toBe(`Owner: Test User → ${other.name}`);
});

test("a viewer can't be made owner, and viewers can't bulk edit at all", async () => {
  const { ids } = await setup(1);
  const viewer = await ensureUser("viewer");
  expect(await bulkSetDrawingOwner({ ids, ownerId: viewer.id }))
    .toEqual({ ok: false, error: "The owner must be an active user who isn't a viewer." });

  await mockSession("viewer");
  expect(await bulkChangeDrawingStatus({ ids, to: "paused" })).toEqual({ ok: false, error: READ_ONLY_ERROR });
  expect(await bulkSetDrawingDueDate({ ids, dueDate: "2026-12-01" })).toEqual({ ok: false, error: READ_ONLY_ERROR });
});

test("due dates are set and cleared together; deleted drawings are reported, not touched", async () => {
  const { ids } = await setup(3);
  await mockSession("admin");
  expect(await deleteDrawing({ id: ids[2] })).toEqual({ ok: true });

  const set = await bulkSetDrawingDueDate({ ids, dueDate: "2026-12-01" });
  if (!set.ok) throw new Error(set.error);
  expect(set.updated.sort()).toEqual([ids[0], ids[1]].sort());
  expect(set.skipped).toEqual([{ id: ids[2], code: "", reason: "Not found — it may have been deleted." }]);

  const cleared = await bulkSetDrawingDueDate({ ids: ids.slice(0, 2), dueDate: null });
  if (!cleared.ok) throw new Error(cleared.error);
  expect(cleared.updated).toHaveLength(2);

  const bodies = (await db
    .select({ body: drawingEvents.body })
    .from(drawingEvents)
    .where(eq(drawingEvents.drawingId, ids[0]))
    .orderBy(drawingEvents.createdAt))
    .map(e => e.body)
    .filter(Boolean);
  expect(bodies).toEqual(["Due date: — → 2026-12-01", "Due date: 2026-12-01 → —"]);
});
