import { beforeEach, expect, test, vi } from "vitest";
import { resetDb, ensureUser } from "@/../tests/test-helpers/db";
import { mockSession } from "@/../tests/test-helpers/auth";
import { db } from "@/db/client";
import {
  approvalWorkflows, bomRevisions, boms, drawingEvents, drawingRevisions, drawingTransmittals, drawings, projects,
} from "@/db/schema";
import { todayIso } from "@/lib/drawing-status";
import {
  countPendingReceipts, getAwaitingSince, getStatusFeed, listBomSends, listIssuedTransmittals,
} from "@/server/queries/status-overview";

vi.mock("@/server/auth-context", () => ({ requireSession: vi.fn(), requireRole: vi.fn() }));

beforeEach(async () => { await resetDb(); });

async function drawingWithRevisions(projectId: string, code: string, deleted = false) {
  const [d] = await db.insert(drawings).values({ projectId, code, name: `${code} name`, deletedAt: deleted ? new Date() : null }).returning();
  const [r1, r2] = await db.insert(drawingRevisions).values([
    { drawingId: d.id, number: 1, status: "approved-b", commitMessage: "First issue" },
    { drawingId: d.id, number: 2, status: "awaiting-approval", commitMessage: "Update" },
  ]).returning();
  return { d, r1, r2 };
}

test("receipts, issues and awaiting dates only count live drawings and current revisions", async () => {
  const { user: me } = await mockSession("viewer");
  const engineer = await ensureUser("member");
  const [p] = await db.insert(projects).values({ code: "P-1", name: "Project One" }).returning();
  const { d, r1, r2 } = await drawingWithRevisions(p.id, "E-01");
  const gone = await drawingWithRevisions(p.id, "E-02", true);

  const at = (h: number) => new Date(Date.now() - h * 3_600_000);
  await db.insert(drawingTransmittals).values([
    { drawingId: d.id, revisionId: r1.id, purpose: "construction", recipientUserId: me.id, sentById: engineer.id, createdAt: at(48) },
    { drawingId: d.id, revisionId: r2.id, purpose: "construction", recipientUserId: me.id, sentById: engineer.id, createdAt: at(2) },
    { drawingId: d.id, revisionId: r2.id, purpose: "approval", externalName: "Client", sentById: engineer.id, createdAt: at(1) },
    { drawingId: d.id, revisionId: r2.id, purpose: "information", recipientUserId: me.id, acknowledgedAt: new Date(), createdAt: at(3) },
    { drawingId: gone.d.id, revisionId: gone.r2.id, purpose: "construction", recipientUserId: me.id, createdAt: at(1) },
  ]);

  // Only the unconfirmed issue of the current revision waits for the viewer.
  expect(await countPendingReceipts()).toBe(1);
  const feed = await getStatusFeed();
  expect(feed.mine.map(t => t.revisionNumber)).toEqual([2]);
  expect(feed.mine[0].sentByName).toBe(engineer.name);

  const issued = await listIssuedTransmittals();
  expect(issued.map(t => [t.revisionNumber, t.superseded])).toEqual([[2, false], [2, false], [2, false], [1, true]]);
  expect(issued.every(t => t.drawingId === d.id)).toBe(true);

  const since = new Date(Date.now() - 5 * 86_400_000);
  await db.insert(drawingEvents).values([
    { drawingId: d.id, revisionId: r1.id, kind: "status", toStatus: "awaiting-approval", createdAt: new Date(Date.now() - 20 * 86_400_000) },
    { drawingId: d.id, revisionId: r2.id, kind: "status", toStatus: "awaiting-approval", createdAt: since },
  ]);
  const awaiting = await getAwaitingSince([d.id]);
  expect(awaiting.get(d.id)).toBe(todayIso(since));
  expect(await getAwaitingSince([])).toEqual(new Map());
});

test("BOM sends skip cancelled workflows and filter by project", async () => {
  await mockSession("viewer");
  const [p1, p2] = await db.insert(projects).values([{ code: "P-1", name: "One" }, { code: "P-2", name: "Two" }]).returning();
  const [b1, b2] = await db.insert(boms).values([{ projectId: p1.id, name: "Main" }, { projectId: p2.id, name: "Other" }]).returning();
  const [ra, rb, rc] = await db.insert(bomRevisions).values([
    { bomId: b1.id, letter: "A", status: "locked" },
    { bomId: b1.id, letter: "B", status: "locked" },
    { bomId: b2.id, letter: "A", status: "locked" },
  ]).returning();
  await db.insert(approvalWorkflows).values([
    { revisionId: ra.id, status: "approved", requestedAt: new Date(Date.now() - 86_400_000) },
    { revisionId: rb.id, status: "cancelled" },
    { revisionId: rc.id, status: "pending" },
  ]);

  expect((await listBomSends()).map(s => `${s.bomName} ${s.revisionLetter}`)).toEqual(["Other A", "Main A"]);
  expect((await listBomSends({ projectId: p1.id })).map(s => s.revisionLetter)).toEqual(["A"]);
  expect((await getStatusFeed({ projectId: p2.id })).bomSends.map(s => s.bomName)).toEqual(["Other"]);
});
