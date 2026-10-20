import { beforeEach, expect, test, vi } from "vitest";
import { resetDb, ensureUser } from "@/../tests/test-helpers/db";
import { mockSession } from "@/../tests/test-helpers/auth";
import { db } from "@/db/client";
import {
  auditLog,
  bomRevisionDrawings,
  bomRevisions,
  boms,
  drawingEvents,
  drawingRemarks,
  drawingRevisions,
  drawingTransmittals,
  drawings,
  projectMilestones,
  projects,
} from "@/db/schema";
import { addDays } from "@/lib/drawing-reminders";
import { todayIso } from "@/lib/drawing-status";
import { markMyWorkSeen } from "@/server/actions/my-work";
import { getMyWork, getMyWorkBellCount } from "@/server/queries/my-work";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }));
vi.mock("@/server/auth-context", () => ({ requireSession: vi.fn(), requireRole: vi.fn() }));

beforeEach(async () => { await resetDb(); });

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);

test("tasks, deadlines and other people's updates are collected — never my own or deleted work", async () => {
  const { user: me } = await mockSession("member");
  const other = await ensureUser("member");
  const today = todayIso();
  const [p] = await db
    .insert(projects)
    .values({ code: "BS-001", name: "BMW showroom", ownerId: me.id, targetDate: addDays(today, 10) })
    .returning();
  await db.insert(projectMilestones).values({ projectId: p.id, name: "Design freeze", dueDate: addDays(today, -2) });

  // Someone else's drawing, sent to me for the internal check two days ago.
  const [toApprove] = await db
    .insert(drawings)
    .values({ projectId: p.id, code: "CC-001", name: "Cameras", ownerId: other.id })
    .returning();
  const [approveRev] = await db
    .insert(drawingRevisions)
    .values({ drawingId: toApprove.id, number: 1, status: "need-approval", reviewerId: me.id, commitMessage: "First" })
    .returning();
  await db.insert(drawingEvents).values({
    drawingId: toApprove.id, revisionId: approveRev.id, kind: "status",
    fromStatus: "in-progress", toStatus: "need-approval", actorId: other.id, createdAt: hoursAgo(50),
  });

  // My drawing: late, with a client remark and a comment from someone else, and a comment of my own.
  const [mine] = await db
    .insert(drawings)
    .values({ projectId: p.id, code: "AC-001", name: "Access control", ownerId: me.id, dueDate: addDays(today, -3) })
    .returning();
  const [mineRev] = await db.insert(drawingRevisions).values({ drawingId: mine.id, number: 1, commitMessage: "First" }).returning();
  await db.insert(drawingRemarks).values({
    drawingId: mine.id, revisionId: mineRev.id, source: "client", body: "Move reader 2", raisedById: other.id, createdAt: hoursAgo(5),
  });
  await db.insert(drawingEvents).values([
    { drawingId: mine.id, revisionId: mineRev.id, kind: "comment", body: "Please check", actorId: other.id, createdAt: hoursAgo(3) },
    { drawingId: mine.id, revisionId: mineRev.id, kind: "comment", body: "My own note", actorId: me.id, createdAt: hoursAgo(2) },
  ]);

  // Issued to me and not confirmed yet.
  await db.insert(drawingTransmittals).values({
    drawingId: toApprove.id, revisionId: approveRev.id, purpose: "construction",
    recipientUserId: me.id, sentById: other.id, createdAt: hoursAgo(1),
  });

  // A deleted drawing of mine shows nowhere.
  const [gone] = await db
    .insert(drawings)
    .values({ projectId: p.id, code: "GN-001", name: "Gone", ownerId: me.id, dueDate: addDays(today, -1), deletedAt: new Date() })
    .returning();
  const [goneRev] = await db.insert(drawingRevisions).values({ drawingId: gone.id, number: 1, commitMessage: "First" }).returning();
  await db.insert(drawingRemarks).values({ drawingId: gone.id, revisionId: goneRev.id, source: "site", body: "Old", raisedById: other.id });

  const work = await getMyWork();
  expect(work.approvals.map(a => [a.code, a.ownerName, a.since])).toEqual([["CC-001", other.name, todayIso(hoursAgo(50))]]);
  expect(work.receipts.map(r => r.code)).toEqual(["CC-001"]);
  expect(work.remarks.map(r => [r.code, r.open, r.latestBody])).toEqual([["AC-001", 1, "Move reader 2"]]);
  expect(work.boms).toEqual([]);
  expect(work.deadlines.map(d => (d.kind === "drawing" ? d.drawing.code : d.project.label)))
    .toEqual(["AC-001", "Design freeze", "Completion"]);
  expect(work.updates.map(u => u.verb)).toEqual(["issued you", "commented on", "raised a client remark on", "asked you to approve"]);
  expect(work.counts).toEqual({
    approvals: 1, receipts: 1, remarks: 1, boms: 0, todo: 3, overdue: 2, dueSoon: 1, newUpdates: 4,
  });
  expect(await getMyWorkBellCount()).toBe(9);

  // Opening My work marks the updates seen; the tasks stay until they're done.
  expect(await markMyWorkSeen()).toEqual({ ok: true });
  const after = await getMyWork();
  expect(after.updates).toHaveLength(4);
  expect(after.counts.newUpdates).toBe(0);
  expect(await getMyWorkBellCount()).toBe(5);

  // A new comment after the visit is new again.
  await db.insert(drawingEvents).values({
    drawingId: mine.id, revisionId: mineRev.id, kind: "comment", body: "One more", actorId: other.id, createdAt: new Date(Date.now() + 1000),
  });
  expect((await getMyWork()).counts.newUpdates).toBe(1);
});

test("BOMs I own: outdated drawings make a task; an approval or a handover by someone else is an update", async () => {
  const { user: me } = await mockSession("member");
  const other = await ensureUser("member");
  const [p] = await db.insert(projects).values({ code: "P-1", name: "Project One" }).returning();
  const [d] = await db.insert(drawings).values({ projectId: p.id, code: "E-01", name: "Layout", ownerId: other.id }).returning();
  const [r1] = await db
    .insert(drawingRevisions)
    .values({ drawingId: d.id, number: 1, status: "approved-a", commitMessage: "First" })
    .returning();
  await db.insert(drawingRevisions).values({ drawingId: d.id, number: 2, commitMessage: "More cameras", bomImpact: true });

  const [b] = await db.insert(boms).values({ projectId: p.id, name: "Main BOM", ownerId: me.id }).returning();
  const [br] = await db.insert(bomRevisions).values({
    bomId: b.id, letter: "2", status: "approved", ownerId: me.id,
    statusChangedById: other.id, statusChangedAt: hoursAgo(4), statusComment: "Client signed",
  }).returning();
  await db.insert(bomRevisionDrawings).values({ bomRevisionId: br.id, drawingId: d.id, drawingRevisionId: r1.id });
  await db.insert(auditLog).values({
    kind: "bom.revision.branched", actorId: other.id, refType: "bom", refId: b.id, summary: "Rev2 branched",
    payload: { letter: "2", ownerId: me.id, previousOwnerId: other.id, projectId: p.id }, createdAt: hoursAgo(6),
  });

  // Someone else's BOM, outdated the same way, is not my task.
  const [theirs] = await db.insert(boms).values({ projectId: p.id, name: "Other BOM", ownerId: other.id }).returning();
  const [tr] = await db.insert(bomRevisions).values({ bomId: theirs.id, letter: "1", status: "committed", ownerId: other.id }).returning();
  await db.insert(bomRevisionDrawings).values({ bomRevisionId: tr.id, drawingId: d.id, drawingRevisionId: r1.id });

  const work = await getMyWork();
  expect(work.boms).toEqual([
    expect.objectContaining({
      bomName: "Main BOM",
      revisionLetter: "2",
      drawings: [{ drawingId: d.id, code: "E-01", linkedNumber: 1, latestNumber: 2 }],
    }),
  ]);
  expect(work.updates.map(u => [u.kind, u.verb, u.subjectRev, u.body])).toEqual([
    ["bom-status", "set Approved on", "Rev2", "“Client signed”"],
    ["bom-owner", "handed you", "Rev2", "You own the new revision now."],
  ]);
  expect(work.counts.todo).toBe(1);
});

test("a viewer sees revisions issued to them and can mark updates seen", async () => {
  const { user: me } = await mockSession("viewer");
  const engineer = await ensureUser("member");
  const [p] = await db.insert(projects).values({ code: "P-1", name: "Project One" }).returning();
  const [d] = await db.insert(drawings).values({ projectId: p.id, code: "E-01", name: "Layout", ownerId: engineer.id }).returning();
  const [r] = await db.insert(drawingRevisions).values({ drawingId: d.id, number: 1, status: "approved-a", commitMessage: "First" }).returning();
  await db.insert(drawingTransmittals).values({
    drawingId: d.id, revisionId: r.id, purpose: "construction", recipientUserId: me.id, sentById: engineer.id, createdAt: hoursAgo(2),
  });

  const work = await getMyWork();
  expect(work.receipts).toHaveLength(1);
  expect(work.updates.map(u => u.kind)).toEqual(["transmittal"]);
  expect(await getMyWorkBellCount()).toBe(2);

  await markMyWorkSeen();
  expect(await getMyWorkBellCount()).toBe(1);
});
