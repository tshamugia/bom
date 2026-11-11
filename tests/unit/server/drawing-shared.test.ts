import { beforeEach, expect, test, vi } from "vitest";
import { count, eq, inArray } from "drizzle-orm";
import { resetDb, ensureUser } from "@/../tests/test-helpers/db";
import { mockSession } from "@/../tests/test-helpers/auth";
import { db } from "@/db/client";
import {
  auditLog,
  drawingDisciplines,
  drawingRemarks,
  drawingRevisions,
  drawingSharedTimeEntries,
  drawingSharedTimeMembers,
  drawingTimeEntries,
  drawings,
  projects,
} from "@/db/schema";
import { SHARED_BLOCK_MESSAGE } from "@/lib/drawing-bulk";
import { summarizeDrawings } from "@/lib/drawing-dashboard";
import { addDays } from "@/lib/drawing-reminders";
import { todayIso } from "@/lib/drawing-status";
import { READ_ONLY_ERROR } from "@/lib/roles";
import { createDrawing, createDrawingRevision, deleteDrawing } from "@/server/actions/drawings";
import { logDrawingTime } from "@/server/actions/drawing-time";
import { resolveDrawingRemark } from "@/server/actions/drawing-remarks";
import {
  addSharedDrawingRemark,
  deleteSharedDrawingTime,
  logSharedDrawingTime,
} from "@/server/actions/drawing-shared";
import { listRemarks, listSharedTimeEntries } from "@/server/queries/drawing-control";
import { getDrawingDashboard } from "@/server/queries/drawing-dashboard";
import { listDrawings } from "@/server/queries/drawings";
import { getMyWork } from "@/server/queries/my-work";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/server/auth-context", () => ({ requireSession: vi.fn(), requireRole: vi.fn() }));

beforeEach(async () => { await resetDb(); });

const today = todayIso();

async function project(code: string) {
  const [p] = await db.insert(projects).values({ code, name: `Project ${code}` }).returning();
  return p;
}

/** `n` drawings in a project, owned by `ownerId`, each with revision P01. */
async function drawingsIn(projectId: string, ownerId: string, n: number, prefix = "Floor") {
  const [d] = await db.insert(drawingDisciplines).values({ name: `CCTV ${Math.random()}` }).returning();
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const r = await createDrawing({
      projectId, name: `${prefix} ${i + 1} cameras`, disciplineId: d.id,
      ownerId, dueDate: null, estimatedHours: 2,
    });
    if (!r.ok) throw new Error(r.error);
    ids.push(r.id);
  }
  return ids;
}

async function totalsFor(projectId?: string) {
  const data = await getDrawingDashboard({ projectId });
  return summarizeDrawings(data.drawings, today, data.sharedTime);
}

const countRows = async (table: typeof drawingSharedTimeEntries | typeof drawingSharedTimeMembers | typeof drawingRemarks) =>
  (await db.select({ n: count() }).from(table))[0].n;

test("5 h on four drawings adds 5 h to the project and overall totals, not 20 — and never to a drawing's Logged", async () => {
  const { user: me } = await mockSession("member");
  const p = await project("26HLT");
  const other = await project("26ZED");
  const ids = await drawingsIn(p.id, me.id, 4);
  const [elsewhere] = await drawingsIn(other.id, me.id, 1, "Lobby");
  await logDrawingTime({ revisionId: (await latest(ids[0])).id, hours: 2, workDate: today });
  await logDrawingTime({ revisionId: (await latest(elsewhere)).id, hours: 1, workDate: today });

  const r = await logSharedDrawingTime({ drawingIds: ids, hours: 5, workDate: today, note: "Coordination" });
  expect(r).toEqual({ ok: true, id: expect.any(String) });
  if (!r.ok) return;

  // One entry, one member row per drawing with the revision it had then.
  const members = await db.select().from(drawingSharedTimeMembers).where(eq(drawingSharedTimeMembers.sharedEntryId, r.id));
  expect(members.map(m => m.drawingId).sort()).toEqual([...ids].sort());
  for (const m of members) expect(m.revisionId).toBe((await latest(m.drawingId)).id);
  expect(await db.select({ n: count() }).from(drawingTimeEntries)).toEqual([{ n: 2 }]);

  const rows = await listDrawings({ projectIds: [p.id] });
  expect(rows.map(x => [x.loggedHours, x.sharedHours]).sort()).toEqual([[0, 5], [0, 5], [0, 5], [2, 5]]);

  const all = await totalsFor();
  expect(all.totals).toMatchObject({ loggedHours: 2 + 1 + 5, sharedHours: 5, sharedEntries: 1 });
  expect(all.byProject.find(g => g.key === p.id)).toMatchObject({ loggedHours: 7, sharedHours: 5 });
  expect(all.byProject.find(g => g.key === other.id)).toMatchObject({ loggedHours: 1, sharedHours: 0 });
  // Each drawing's estimate is 2 h: the one with 2 h of its own is on budget, the shared 5 h don't push any over.
  expect(all.overBudget).toEqual([]);
  expect((await totalsFor(p.id)).totals).toMatchObject({ loggedHours: 7, sharedHours: 5 });
  expect((await totalsFor(other.id)).totals).toMatchObject({ loggedHours: 1, sharedHours: 0 });

  // One audit row for the entry, naming every drawing.
  const audits = await db.select().from(auditLog).where(eq(auditLog.kind, "drawing.time.shared.logged"));
  expect(audits).toHaveLength(1);
  expect(audits[0]).toMatchObject({ refType: "project", refId: p.id });
  expect((audits[0].payload as { drawingIds: string[] }).drawingIds.sort()).toEqual([...ids].sort());
});

test("a drawing in a shared entry still takes its own time, on the same revision and on a newer one", async () => {
  const { user: me } = await mockSession("member");
  const p = await project("26HLT");
  const ids = await drawingsIn(p.id, me.id, 2);
  const shared = await logSharedDrawingTime({ drawingIds: ids, hours: 3, workDate: today });
  expect(shared.ok).toBe(true);

  const p01 = await latest(ids[0]);
  expect(await logDrawingTime({ revisionId: p01.id, hours: 1, workDate: today })).toEqual({ ok: true });
  const next = await createDrawingRevision({ drawingId: ids[0], commitMessage: "Client comments" });
  expect(next.ok).toBe(true);
  const p02 = await latest(ids[0]);
  expect(p02.id).not.toBe(p01.id);
  expect(await logDrawingTime({ revisionId: p02.id, hours: 2, workDate: today })).toEqual({ ok: true });

  const [row] = (await listDrawings({ projectIds: [p.id] })).filter(r => r.id === ids[0]);
  expect(row).toMatchObject({ loggedHours: 3, sharedHours: 3 });
  expect((await totalsFor(p.id)).totals).toMatchObject({ loggedHours: 3 + 3, sharedHours: 3 });

  // The drawing page lists the entry with the revision it was logged on and the other drawing.
  const entries = await listSharedTimeEntries(ids[0]);
  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({ hours: 3, revisionId: p01.id, revisionLabel: "P01", userId: me.id });
  expect(entries[0].drawings.map(d => d.drawingId).sort()).toEqual([...ids].sort());
});

test("shared time stays in one project, needs two drawings and no future date — nothing is written otherwise", async () => {
  const { user: me } = await mockSession("member");
  const [a] = await drawingsIn((await project("26HLT")).id, me.id, 1);
  const [b] = await drawingsIn((await project("26ZED")).id, me.id, 1, "Lobby");

  expect(await logSharedDrawingTime({ drawingIds: [a, b], hours: 5, workDate: today }))
    .toEqual({ ok: false, error: SHARED_BLOCK_MESSAGE.projects });
  expect(await logSharedDrawingTime({ drawingIds: [a, a], hours: 5, workDate: today }))
    .toEqual({ ok: false, error: SHARED_BLOCK_MESSAGE["too-few"] });
  await expect(logSharedDrawingTime({ drawingIds: [a], hours: 5, workDate: today })).rejects.toThrow();
  expect(await logSharedDrawingTime({ drawingIds: [a, b], hours: 5, workDate: addDays(today, 1) }))
    .toEqual({ ok: false, error: "Time can't be logged for a future date." });
  await expect(logSharedDrawingTime({ drawingIds: [a, b], hours: 25, workDate: today })).rejects.toThrow();

  expect(await countRows(drawingSharedTimeEntries)).toBe(0);
  expect(await countRows(drawingSharedTimeMembers)).toBe(0);
});

test("an archived drawing in the selection fails the whole action — also when it is archived while the action runs", async () => {
  const { user: me } = await mockSession("admin");
  const p = await project("26HLT");
  const ids = await drawingsIn(p.id, me.id, 3);

  // Archived before: nothing is written, for time or for a remark.
  expect(await deleteDrawing({ id: ids[2] })).toEqual({ ok: true });
  const time = await logSharedDrawingTime({ drawingIds: ids, hours: 5, workDate: today });
  expect(time).toEqual({ ok: false, error: expect.stringMatching(/archived or deleted in the meantime — nothing was saved/) });
  const remark = await addSharedDrawingRemark({ drawingIds: ids, source: "client", body: "New legend" });
  expect(remark.ok).toBe(false);
  expect(await countRows(drawingSharedTimeEntries)).toBe(0);
  expect(await countRows(drawingRemarks)).toBe(0);

  // Archived while the action waits: the drawings are locked and re-read, so the action fails instead
  // of writing a member row for a drawing that is archived by the time it commits.
  const live = ids.slice(0, 2);
  let locked!: () => void;
  let release!: () => void;
  const isLocked = new Promise<void>(r => { locked = r; });
  const gate = new Promise<void>(r => { release = r; });
  const archiving = db.transaction(async tx => {
    await tx.update(drawings).set({ deletedAt: new Date() }).where(eq(drawings.id, live[1]));
    locked();
    await gate;
  });
  await isLocked;
  const racing = logSharedDrawingTime({ drawingIds: live, hours: 5, workDate: today });
  await new Promise(r => setTimeout(r, 150));
  release();
  await archiving;
  expect(await racing).toEqual({ ok: false, error: expect.stringMatching(/nothing was saved/) });
  expect(await countRows(drawingSharedTimeEntries)).toBe(0);
  expect(await countRows(drawingSharedTimeMembers)).toBe(0);
});

test("removing a shared entry takes it off every drawing and out of the totals once; own entries or an admin", async () => {
  const { user: owner } = await mockSession("member");
  const p = await project("26HLT");
  const ids = await drawingsIn(p.id, owner.id, 4);
  const r = await logSharedDrawingTime({ drawingIds: ids, hours: 5, workDate: today });
  if (!r.ok) throw new Error(r.error);
  await logDrawingTime({ revisionId: (await latest(ids[1])).id, hours: 1, workDate: today });
  expect((await totalsFor()).totals.loggedHours).toBe(6);

  await mockSession("member");
  expect(await deleteSharedDrawingTime({ id: r.id })).toEqual({ ok: false, error: "You can only remove your own time entries." });

  await mockSession("admin");
  expect(await deleteSharedDrawingTime({ id: r.id })).toEqual({ ok: true });
  expect(await countRows(drawingSharedTimeMembers)).toBe(0);
  for (const id of ids) expect(await listSharedTimeEntries(id)).toEqual([]);
  expect((await totalsFor()).totals).toMatchObject({ loggedHours: 1, sharedHours: 0 });
  const [audit] = await db.select().from(auditLog).where(eq(auditLog.kind, "drawing.time.shared.deleted"));
  expect((audit.payload as { drawingIds: string[] }).drawingIds.sort()).toEqual([...ids].sort());
});

test("archived drawings: the entry counts while one of its drawings is live", async () => {
  const { user: me } = await mockSession("admin");
  const p = await project("26HLT");
  const ids = await drawingsIn(p.id, me.id, 2);
  const r = await logSharedDrawingTime({ drawingIds: ids, hours: 5, workDate: today });
  expect(r.ok).toBe(true);

  await deleteDrawing({ id: ids[0] });
  expect((await totalsFor()).totals).toMatchObject({ loggedHours: 5, sharedHours: 5 });
  await deleteDrawing({ id: ids[1] });
  expect((await totalsFor()).totals).toMatchObject({ loggedHours: 0, sharedHours: 0, sharedEntries: 0 });
});

test("a shared remark is one ordinary remark per drawing, across projects, each closed on its own", async () => {
  const { user: me } = await mockSession("member");
  const p = await project("26HLT");
  const q = await project("26ZED");
  const ids = [...await drawingsIn(p.id, me.id, 2), ...await drawingsIn(q.id, me.id, 1, "Lobby")];
  const next = await createDrawingRevision({ drawingId: ids[0], commitMessage: "Rework" });
  expect(next.ok).toBe(true);

  const r = await addSharedDrawingRemark({ drawingIds: ids, source: "site", body: "Use the new cable tray legend" });
  expect(r).toEqual({ ok: true, groupId: expect.any(String) });
  if (!r.ok) return;

  const remarks = await db.select().from(drawingRemarks).where(inArray(drawingRemarks.drawingId, ids));
  expect(remarks).toHaveLength(3);
  for (const x of remarks) {
    expect(x).toMatchObject({ sharedGroupId: r.groupId, source: "site", raisedById: me.id, resolvedAt: null });
    expect(x.revisionId).toBe((await latest(x.drawingId)).id);
  }
  // Every drawing counts its own open remark — the register, My work and the bell need no change.
  expect((await listDrawings()).map(d => d.openRemarks)).toEqual([1, 1, 1]);
  const audits = await db.select().from(auditLog).where(eq(auditLog.kind, "drawing.remark.added"));
  expect(audits).toHaveLength(3);
  expect(audits.every(a => (a.payload as { shared?: boolean }).shared === true)).toBe(true);

  // Resolving it on one drawing leaves the others open.
  const first = remarks.find(x => x.drawingId === ids[0])!;
  expect(await resolveDrawingRemark({ id: first.id, resolution: "Fixed in P02" })).toEqual({ ok: true });
  const after = await db.select().from(drawingRemarks).where(inArray(drawingRemarks.drawingId, ids));
  expect(after.filter(x => x.resolvedAt).map(x => x.drawingId)).toEqual([ids[0]]);

  // Each drawing's Remarks card lists the drawings it went on, each open or resolved.
  const [onSecond] = await listRemarks(ids[1]);
  expect(onSecond.shared?.map(s => [s.drawingId, s.resolved]).sort()).toEqual(
    [[ids[0], true], [ids[1], false], [ids[2], false]].sort(),
  );
});

test("My work shows a remark shared by several of my drawings as one update", async () => {
  const me = await ensureUser("member");
  const { user: other } = await mockSession("member");
  const p = await project("26HLT");
  const ids = await drawingsIn(p.id, me.id, 3);
  const [notMine] = await drawingsIn(p.id, other.id, 1, "Roof");
  const r = await addSharedDrawingRemark({ drawingIds: [...ids, notMine], source: "client", body: "New legend" });
  expect(r.ok).toBe(true);

  await mockSession("member");
  const { requireSession } = await import("@/server/auth-context");
  vi.mocked(requireSession).mockResolvedValue({ user: { ...me }, session: { id: "s", userId: me.id } } as never);
  const work = await getMyWork();
  const remarkUpdates = work.updates.filter(u => u.kind === "remark");
  expect(remarkUpdates).toHaveLength(1);
  expect(remarkUpdates[0]).toMatchObject({ verb: "raised a shared client remark on", subjectRev: "+3" });
  // The to-do list still counts each of my drawings with an open remark.
  expect(work.remarks).toHaveLength(3);
});

test("viewers can't log or remove shared time or write a shared remark, and get no shared hours", async () => {
  const { user: member } = await mockSession("member");
  const p = await project("26HLT");
  const ids = await drawingsIn(p.id, member.id, 2);
  const r = await logSharedDrawingTime({ drawingIds: ids, hours: 2, workDate: today });
  if (!r.ok) throw new Error(r.error);

  await mockSession("viewer");
  expect(await logSharedDrawingTime({ drawingIds: ids, hours: 2, workDate: today })).toEqual({ ok: false, error: READ_ONLY_ERROR });
  expect(await deleteSharedDrawingTime({ id: r.id })).toEqual({ ok: false, error: READ_ONLY_ERROR });
  expect(await addSharedDrawingRemark({ drawingIds: ids, source: "client", body: "x" })).toEqual({ ok: false, error: READ_ONLY_ERROR });
  expect(await listSharedTimeEntries(ids[0])).toEqual([]);
  expect(await countRows(drawingSharedTimeEntries)).toBe(1);
  expect(await countRows(drawingRemarks)).toBe(0);
});

async function latest(drawingId: string) {
  const revs = await db
    .select({ id: drawingRevisions.id, number: drawingRevisions.number })
    .from(drawingRevisions)
    .where(eq(drawingRevisions.drawingId, drawingId));
  return revs.sort((a, b) => b.number - a.number)[0];
}
