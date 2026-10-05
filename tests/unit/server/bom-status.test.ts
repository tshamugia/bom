import { beforeEach, expect, test, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { ensureUser, resetDb } from "@/../tests/test-helpers/db";
import { mockSession } from "@/../tests/test-helpers/auth";
import { db } from "@/db/client";
import {
  approvalWorkflows, auditLog, bomLines, bomRevisionDrawings, bomRevisions, boms, categories,
  drawingDisciplines, drawingRevisions, drawings, items, projects, vendors,
} from "@/db/schema";
import { READ_ONLY_ERROR } from "@/lib/roles";
import { BOM_STATUS_ERROR_MESSAGE } from "@/lib/bom-status";
import { changeRevisionStatus } from "@/server/actions/revisions";
import { requestApproval } from "@/server/actions/approvals";
import { deleteBom } from "@/server/actions/boms";
import { listAllBoms } from "@/server/queries/boms";
import { getActiveRevision } from "@/server/queries/projects";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/server/auth-context", () => ({ requireSession: vi.fn(), requireRole: vi.fn() }));

beforeEach(async () => { await resetDb(); });

let seq = 0;

/** A BOM whose Rev A is committed with one line. */
async function setup(name = "Main BOM", projectCode = "P-1") {
  const [v] = await db.insert(vendors).values({ name: `V${++seq}`, code: `V${seq}`, country: "US", leadTime: "3d", rating: 4, status: "approved" }).returning();
  const [c] = await db.insert(categories).values({ name: `C${seq}` }).returning();
  const [it] = await db.insert(items).values({ sku: `S${seq}`, description: "d", manufacturer: "m", unit: "pcs", vendorId: v.id, categoryId: c.id, subcategoryId: null }).returning();
  const [p] = await db.insert(projects).values({ code: projectCode, name: `Project ${projectCode}` }).returning();
  const [b] = await db.insert(boms).values({ projectId: p.id, name }).returning();
  const [r] = await db.insert(bomRevisions).values({ bomId: b.id, letter: "A", status: "committed" }).returning();
  await db.insert(bomLines).values({ revisionId: r.id, itemId: it.id, qty: 1, position: 0 });
  return { projectId: p.id, bomId: b.id, revisionId: r.id };
}

const revision = async (id: string) => (await db.select().from(bomRevisions).where(eq(bomRevisions.id, id)))[0];
const auditOf = (kind: "bom.status.changed" | "bom.deleted") => db.select().from(auditLog).where(eq(auditLog.kind, kind));

test("a member records the client's approval with who, when and the comment", async () => {
  const s = await setup();
  const { user: u } = await mockSession("member");

  expect(await changeRevisionStatus({ revisionId: s.revisionId, to: "approved", comment: " Client email of 5 Oct " }))
    .toEqual({ ok: true });

  const rev = await revision(s.revisionId);
  expect(rev.status).toBe("approved");
  expect(rev.statusChangedById).toBe(u.id);
  expect(rev.statusChangedAt).toBeInstanceOf(Date);
  expect(rev.statusComment).toBe("Client email of 5 Oct");

  const [entry] = await auditOf("bom.status.changed");
  expect(entry.actorId).toBe(u.id);
  expect(entry.summary).toBe("Main BOM Rev A: Committed → Approved — Client email of 5 Oct");
  expect(entry.payload).toMatchObject({ revisionId: s.revisionId, from: "committed", to: "approved", comment: "Client email of 5 Oct" });

  expect(await getActiveRevision(s.bomId)).toMatchObject({
    status: "approved", statusChangedByName: "Test User", statusComment: "Client email of 5 Oct", sent: false,
  });
});

test("a status change needs a comment", async () => {
  const s = await setup();
  await mockSession("member");
  expect(await changeRevisionStatus({ revisionId: s.revisionId, to: "approved", comment: "  " }))
    .toEqual({ ok: false, error: BOM_STATUS_ERROR_MESSAGE.COMMENT_REQUIRED });
  expect((await revision(s.revisionId)).status).toBe("committed");
  expect(await auditOf("bom.status.changed")).toHaveLength(0);
});

test("viewers can't change a BOM's status", async () => {
  const s = await setup();
  await mockSession("viewer");
  expect(await changeRevisionStatus({ revisionId: s.revisionId, to: "approved", comment: "ok" }))
    .toEqual({ ok: false, error: READ_ONLY_ERROR });
  expect((await revision(s.revisionId)).status).toBe("committed");
});

test("a draft changes status only by committing it", async () => {
  const s = await setup();
  await db.update(bomRevisions).set({ status: "draft" }).where(eq(bomRevisions.id, s.revisionId));
  await mockSession("member");
  expect(await changeRevisionStatus({ revisionId: s.revisionId, to: "approved", comment: "ok" }))
    .toEqual({ ok: false, error: BOM_STATUS_ERROR_MESSAGE.DRAFT });
});

test("only the latest committed revision changes status, even with a draft on top", async () => {
  const s = await setup();
  await mockSession("member");
  const [b] = await db.insert(bomRevisions)
    .values({ bomId: s.bomId, letter: "B", status: "draft", parentRevisionId: s.revisionId, createdAt: new Date(Date.now() + 1000) })
    .returning();

  // Rev B is still a draft, so Rev A is the latest committed revision.
  expect(await changeRevisionStatus({ revisionId: s.revisionId, to: "approved", comment: "Approved by phone" }))
    .toEqual({ ok: true });

  await db.update(bomRevisions).set({ status: "committed" }).where(eq(bomRevisions.id, b.id));
  expect(await changeRevisionStatus({ revisionId: s.revisionId, to: "committed", comment: "Withdrawn" }))
    .toEqual({ ok: false, error: BOM_STATUS_ERROR_MESSAGE.REVISION_LOCKED });
  expect((await revision(s.revisionId)).status).toBe("approved");
});

test("taking the approval back returns the revision to where it was", async () => {
  const s = await setup();
  await mockSession("member");
  await changeRevisionStatus({ revisionId: s.revisionId, to: "approved", comment: "Client email" });

  expect(await changeRevisionStatus({ revisionId: s.revisionId, to: "review", comment: "x" }))
    .toEqual({ ok: false, error: BOM_STATUS_ERROR_MESSAGE.NOT_ALLOWED });
  expect(await changeRevisionStatus({ revisionId: s.revisionId, to: "committed", comment: "Client asked for changes" }))
    .toEqual({ ok: true });
  const rev = await revision(s.revisionId);
  expect(rev.status).toBe("committed");
  expect(rev.statusComment).toBe("Client asked for changes");
  expect((await auditOf("bom.status.changed")).map(a => a.payload?.to).sort()).toEqual(["approved", "committed"]);
});

test("an approved revision goes to procurement once and stays approved", async () => {
  const s = await setup();
  await mockSession("member");
  await changeRevisionStatus({ revisionId: s.revisionId, to: "approved", comment: "Client email" });

  await requestApproval({ revisionId: s.revisionId });
  expect((await revision(s.revisionId)).status).toBe("approved");
  expect(await db.select().from(approvalWorkflows).where(eq(approvalWorkflows.revisionId, s.revisionId))).toHaveLength(1);
  await expect(requestApproval({ revisionId: s.revisionId })).rejects.toThrow(/REVISION_ALREADY_SENT/);

  // Once sent, taking the approval back lands on Sent to procurement.
  expect((await getActiveRevision(s.bomId))?.sent).toBe(true);
  expect(await changeRevisionStatus({ revisionId: s.revisionId, to: "committed", comment: "x" }))
    .toEqual({ ok: false, error: BOM_STATUS_ERROR_MESSAGE.NOT_ALLOWED });
  expect(await changeRevisionStatus({ revisionId: s.revisionId, to: "review", comment: "Approval was for Rev B" }))
    .toEqual({ ok: true });
  expect((await revision(s.revisionId)).status).toBe("review");
});

test("a revision sent to procurement can still be approved", async () => {
  const s = await setup();
  await mockSession("member");
  await requestApproval({ revisionId: s.revisionId });
  expect((await revision(s.revisionId)).status).toBe("review");

  expect(await changeRevisionStatus({ revisionId: s.revisionId, to: "approved", comment: "Signed off on site" }))
    .toEqual({ ok: true });
  expect((await revision(s.revisionId)).status).toBe("approved");
});

test("an admin deletes a BOM with a reason that goes to the audit log", async () => {
  const s = await setup("Spare BOM");
  const { user: admin } = await mockSession("admin");

  await deleteBom({ bomId: s.bomId, reason: "  Duplicate of Main BOM " });

  const [b] = await db.select().from(boms).where(eq(boms.id, s.bomId));
  expect(b.deletedAt).toBeInstanceOf(Date);
  expect(b.lastModifiedById).toBe(admin.id);
  const [entry] = await auditOf("bom.deleted");
  expect(entry.actorId).toBe(admin.id);
  expect(entry.summary).toBe('BOM "Spare BOM" deleted — Duplicate of Main BOM');
  expect(entry.payload).toMatchObject({ projectId: s.projectId, name: "Spare BOM", reason: "Duplicate of Main BOM" });
  expect(await listAllBoms()).toHaveLength(0);
  // The revisions stay.
  expect(await revision(s.revisionId)).toBeTruthy();

  await expect(deleteBom({ bomId: s.bomId, reason: "Again" })).rejects.toThrow(/BOM_NOT_FOUND/);
});

test("deleting a BOM needs a reason and an admin", async () => {
  const s = await setup();
  await mockSession("admin");
  await expect(deleteBom({ bomId: s.bomId, reason: " " })).rejects.toThrow();

  await mockSession("member");
  await expect(deleteBom({ bomId: s.bomId, reason: "Not needed" })).rejects.toThrow(/FORBIDDEN/);
  const [b] = await db.select().from(boms).where(eq(boms.id, s.bomId));
  expect(b.deletedAt).toBeNull();
  expect(await auditOf("bom.deleted")).toHaveLength(0);
});

test("the BOM Builder list filters by project, owner and search, and counts outdated drawings", async () => {
  const a = await setup("Fire alarm", "BMW-001");
  const b = await setup("CCTV", "AUD-001");
  const { user: u } = await mockSession("member");
  const other = await ensureUser("member");
  await db.update(boms).set({ ownerId: u.id }).where(eq(boms.id, a.bomId));
  await db.update(boms).set({ ownerId: other.id }).where(eq(boms.id, b.bomId));

  expect((await listAllBoms({ projectId: a.projectId })).map(r => r.name)).toEqual(["Fire alarm"]);
  expect((await listAllBoms({ ownerId: other.id })).map(r => r.name)).toEqual(["CCTV"]);
  expect((await listAllBoms({ search: "aud" })).map(r => r.name)).toEqual(["CCTV"]);
  expect((await listAllBoms({ search: "fire" })).map(r => r.name)).toEqual(["Fire alarm"]);
  expect(await listAllBoms({ search: "100%" })).toHaveLength(0);

  // Rev A of "Fire alarm" was built from rev1; rev2 changes the BOM.
  const [disc] = await db.insert(drawingDisciplines).values({ name: `Status test ${Date.now()}` }).returning();
  const [d] = await db.insert(drawings).values({ projectId: a.projectId, code: "E-01", name: "Layout", disciplineId: disc.id }).returning();
  const [r1] = await db.insert(drawingRevisions).values({ drawingId: d.id, number: 1, commitMessage: "First" }).returning();
  await db.insert(bomRevisionDrawings).values({ bomRevisionId: a.revisionId, drawingId: d.id, drawingRevisionId: r1.id });
  expect((await listAllBoms({ projectId: a.projectId }))[0].outdatedDrawings).toBe(0);

  await db.insert(drawingRevisions).values({ drawingId: d.id, number: 2, commitMessage: "More detectors" });
  const [row] = await listAllBoms({ projectId: a.projectId });
  expect(row.outdatedDrawings).toBe(1);
  expect(row.activeRevisionStatus).toBe("committed");

  // A newer revision that doesn't change the BOM leaves it current.
  await db.update(drawingRevisions).set({ bomImpact: false })
    .where(and(eq(drawingRevisions.drawingId, d.id), eq(drawingRevisions.number, 2)));
  expect((await listAllBoms({ projectId: a.projectId }))[0].outdatedDrawings).toBe(0);
});
