import { beforeEach, expect, test, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { resetDb } from "@/../tests/test-helpers/db";
import { mockSession } from "@/../tests/test-helpers/auth";
import { db } from "@/db/client";
import {
  bomRevisions, boms, drawingDisciplines, drawingEvents, drawingRevisions, drawings, projects,
} from "@/db/schema";
import { READ_ONLY_ERROR } from "@/lib/roles";
import { createDrawingRevision, setDrawingRevisionBomImpact } from "@/server/actions/drawings";
import { confirmNoBomChange, linkDrawingsToBom, updateBomDrawingLinks } from "@/server/actions/bom-drawing-links";
import { branchRevision } from "@/server/actions/revisions";
import { listBomLinksForDrawing, listDrawingLinksForBomRevision } from "@/server/queries/drawing-control";
import { getDrawingDashboard } from "@/server/queries/drawing-dashboard";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/server/auth-context", () => ({ requireSession: vi.fn(), requireRole: vi.fn() }));

beforeEach(async () => { await resetDb(); });

let seq = 0;

/** A committed BOM Rev A built from rev1 of a drawing. */
async function setup() {
  const { user: u } = await mockSession("member");
  const [p] = await db.insert(projects).values({ code: "P-1", name: "Project One" }).returning();
  const [disc] = await db.insert(drawingDisciplines).values({ name: `BOM impact ${Date.now()}-${++seq}` }).returning();
  const [d] = await db
    .insert(drawings)
    .values({ projectId: p.id, code: "E-01", name: "Camera layout", disciplineId: disc.id, ownerId: u.id })
    .returning();
  await db.insert(drawingRevisions).values({ drawingId: d.id, number: 1, commitMessage: "Initial revision" });
  const [b] = await db.insert(boms).values({ projectId: p.id, name: "Main BOM" }).returning();
  const [r] = await db.insert(bomRevisions).values({ bomId: b.id, letter: "A", status: "draft", ownerId: u.id }).returning();
  expect(await linkDrawingsToBom({ bomRevisionId: r.id, drawingIds: [d.id] })).toEqual({ ok: true, added: 1 });
  await db.update(bomRevisions).set({ status: "committed" }).where(eq(bomRevisions.id, r.id));
  return { projectId: p.id, disciplineId: disc.id, drawingId: d.id, revisionId: r.id };
}

const linkOf = async (bomRevisionId: string) => (await listDrawingLinksForBomRevision(bomRevisionId))[0];

const check = (bomRevisionId: string, l: { linkId: string; latestRevisionId: string }) =>
  confirmNoBomChange({ bomRevisionId, checks: [{ linkId: l.linkId, drawingRevisionId: l.latestRevisionId }] });

test("a drawing revision marked as no BOM change keeps the BOM current", async () => {
  const s = await setup();
  expect(await createDrawingRevision({ drawingId: s.drawingId, commitMessage: "Moved title block", bomImpact: false }))
    .toEqual({ ok: true, number: 2 });

  expect(await linkOf(s.revisionId)).toMatchObject({
    linkedRevisionNumber: 1, latestRevisionNumber: 2, outdated: false, newerRevisions: [],
  });
  expect((await listBomLinksForDrawing(s.drawingId))[0].outdated).toBe(false);
  expect((await getDrawingDashboard()).outdatedBoms).toHaveLength(0);

  await createDrawingRevision({ drawingId: s.drawingId, commitMessage: "Two more cameras" });
  const l = await linkOf(s.revisionId);
  expect(l.outdated).toBe(true);
  expect(l.newerRevisions.map(r => [r.number, r.bomImpact])).toEqual([[2, false], [3, true]]);
  expect((await getDrawingDashboard()).outdatedBoms).toMatchObject([{ linkedNumber: 1, latestNumber: 3 }]);
});

test("no BOM change on a committed revision clears it without touching the built-from revision", async () => {
  const s = await setup();
  await createDrawingRevision({ drawingId: s.drawingId, commitMessage: "Moved cameras" });
  const before = await linkOf(s.revisionId);
  expect(before.outdated).toBe(true);

  expect(await check(s.revisionId, before)).toEqual({ ok: true, confirmed: 1 });
  expect(await linkOf(s.revisionId)).toMatchObject({
    linkedRevisionNumber: 1, checkedRevisionNumber: 2, checkedByName: "Test User", outdated: false,
  });
  expect((await listBomLinksForDrawing(s.drawingId))[0]).toMatchObject({
    drawingRevisionNumber: 1, checkedRevisionNumber: 2, outdated: false,
  });
  expect((await getDrawingDashboard()).outdatedBoms).toHaveLength(0);
  const [rev] = await db.select({ status: bomRevisions.status }).from(bomRevisions).where(eq(bomRevisions.id, s.revisionId));
  expect(rev.status).toBe("committed");

  // Checking again is a no-op; a later revision that changes the BOM outdates it again.
  expect(await check(s.revisionId, before)).toEqual({ ok: true, confirmed: 0 });
  await createDrawingRevision({ drawingId: s.drawingId, commitMessage: "Extra rack" });
  expect((await linkOf(s.revisionId)).outdated).toBe(true);
});

test("a check covers only the drawing revision the user looked at", async () => {
  const s = await setup();
  await createDrawingRevision({ drawingId: s.drawingId, commitMessage: "Moved cameras" });
  const seen = await linkOf(s.revisionId);
  await createDrawingRevision({ drawingId: s.drawingId, commitMessage: "Added a rack" });

  expect(await check(s.revisionId, seen)).toEqual({ ok: true, confirmed: 1 });
  const l = await linkOf(s.revisionId);
  expect(l).toMatchObject({ checkedRevisionNumber: 2, outdated: true });
  expect(l.newerRevisions.map(r => r.number)).toEqual([3]);
});

test("a revision of another drawing can't be used as the check", async () => {
  const s = await setup();
  await createDrawingRevision({ drawingId: s.drawingId, commitMessage: "Moved cameras" });
  const [other] = await db
    .insert(drawings)
    .values({ projectId: s.projectId, code: "E-02", name: "Other", disciplineId: s.disciplineId })
    .returning();
  const [otherRev] = await db
    .insert(drawingRevisions)
    .values({ drawingId: other.id, number: 5, commitMessage: "x" })
    .returning();

  const l = await linkOf(s.revisionId);
  expect(await confirmNoBomChange({ bomRevisionId: s.revisionId, checks: [{ linkId: l.linkId, drawingRevisionId: otherRev.id }] }))
    .toEqual({ ok: false, error: "Drawing reference not found — refresh the page." });
  expect((await linkOf(s.revisionId)).checkedRevisionNumber).toBeNull();
});

test("a branch carries the check over, only the current BOM revision can be checked, and updating clears it", async () => {
  const s = await setup();
  await createDrawingRevision({ drawingId: s.drawingId, commitMessage: "Moved cameras" });
  const l = await linkOf(s.revisionId);
  await check(s.revisionId, l);

  const draftId = await branchRevision({ parentRevisionId: s.revisionId });
  expect(await linkOf(draftId)).toMatchObject({ linkedRevisionNumber: 1, checkedRevisionNumber: 2, outdated: false });
  expect(await check(s.revisionId, l))
    .toEqual({ ok: false, error: "Only the BOM's current revision can be checked against newer drawings." });

  await createDrawingRevision({ drawingId: s.drawingId, commitMessage: "Renumbered sheets", bomImpact: false });
  expect(await updateBomDrawingLinks({ bomRevisionId: draftId })).toEqual({ ok: true, updated: 1 });
  expect(await linkOf(draftId)).toMatchObject({ linkedRevisionNumber: 3, checkedRevisionNumber: null, outdated: false });
});

test("BOM impact can be corrected on the current revision only, and viewers can't change either", async () => {
  const s = await setup();
  await createDrawingRevision({ drawingId: s.drawingId, commitMessage: "Moved cameras" });
  const [rev2] = await db
    .select()
    .from(drawingRevisions)
    .where(and(eq(drawingRevisions.drawingId, s.drawingId), eq(drawingRevisions.number, 2)));
  expect(rev2.bomImpact).toBe(true);
  expect((await linkOf(s.revisionId)).outdated).toBe(true);

  expect(await setDrawingRevisionBomImpact({ revisionId: rev2.id, bomImpact: false })).toEqual({ ok: true });
  expect((await linkOf(s.revisionId)).outdated).toBe(false);
  const events = await db.select().from(drawingEvents).where(eq(drawingEvents.revisionId, rev2.id));
  expect(events.find(e => e.kind === "updated")?.body).toBe("BOM impact: changes the BOM → no BOM change");

  await createDrawingRevision({ drawingId: s.drawingId, commitMessage: "Added a rack" });
  expect(await setDrawingRevisionBomImpact({ revisionId: rev2.id, bomImpact: true }))
    .toEqual({ ok: false, error: "Only the current revision can change — older revisions are locked." });

  await mockSession("viewer");
  const l = await linkOf(s.revisionId);
  expect(await setDrawingRevisionBomImpact({ revisionId: l.latestRevisionId, bomImpact: false }))
    .toEqual({ ok: false, error: READ_ONLY_ERROR });
  expect(await check(s.revisionId, l)).toEqual({ ok: false, error: READ_ONLY_ERROR });
  expect(await createDrawingRevision({ drawingId: s.drawingId, commitMessage: "x", bomImpact: false }))
    .toEqual({ ok: false, error: READ_ONLY_ERROR });
});
