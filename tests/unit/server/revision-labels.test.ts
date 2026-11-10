import { beforeEach, expect, test, vi } from "vitest";
import { asc, eq } from "drizzle-orm";
import { ensureUser, resetDb } from "@/../tests/test-helpers/db";
import { mockSession } from "@/../tests/test-helpers/auth";
import { db } from "@/db/client";
import {
  auditLog, bomRevisions, boms, drawingDisciplines, drawingRevisions, drawingTransmittals, projects,
} from "@/db/schema";
import { bulkChangeDrawingStatus, changeDrawingStatus, createDrawing, createDrawingRevision } from "@/server/actions/drawings";
import { issueDrawingTransmittal } from "@/server/actions/drawing-transmittals";
import { changeRevisionStatus } from "@/server/actions/revisions";
import { listTransmittals } from "@/server/queries/drawing-control";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/server/auth-context", () => ({ requireSession: vi.fn(), requireRole: vi.fn() }));

beforeEach(async () => { await resetDb(); });

// NAMING §6: P01, P02… until the client approves, C01, C02… from then on.

async function drawing(name = "Floor 1 cameras") {
  const { user: me } = await mockSession("member");
  const [p] = await db.insert(projects).values({ code: "26TGT", name: "Tegeta Motors" }).returning();
  const [d] = await db.insert(drawingDisciplines).values({ name: `CCTV ${Date.now()}` }).returning();
  const r = await createDrawing({ projectId: p.id, name, disciplineId: d.id, ownerId: me.id, dueDate: null, estimatedHours: null });
  if (!r.ok) throw new Error(r.error);
  return { me, drawingId: r.id };
}

const revisions = (drawingId: string) => db
  .select({ id: drawingRevisions.id, number: drawingRevisions.number, cNumber: drawingRevisions.cNumber, label: drawingRevisions.label })
  .from(drawingRevisions)
  .where(eq(drawingRevisions.drawingId, drawingId))
  .orderBy(asc(drawingRevisions.number));

/** Puts the revision where the client's approval is the next step: signed off internally, sent to the client. */
async function readyForApproval(revisionId: string) {
  const reviewer = await ensureUser("member");
  await db.update(drawingRevisions)
    .set({ status: "awaiting-approval", reviewerId: reviewer.id, reviewedById: reviewer.id, reviewedAt: new Date() })
    .where(eq(drawingRevisions.id, revisionId));
}

test("revisions are P until the client approves one; that one becomes C01 and every later one continues C", async () => {
  const { drawingId } = await drawing();
  expect((await revisions(drawingId)).map(r => r.label)).toEqual(["P01"]);

  expect(await createDrawingRevision({ drawingId, commitMessage: "Client comments", bomImpact: true }))
    .toEqual({ ok: true, number: 2, label: "P02" });
  const [, p02] = await revisions(drawingId);

  await readyForApproval(p02.id);
  expect(await changeDrawingStatus({ revisionId: p02.id, to: "approved-a" })).toEqual({ ok: true });
  expect((await revisions(drawingId)).map(r => r.label)).toEqual(["P01", "C01"]);
  const [audit] = await db.select().from(auditLog).where(eq(auditLog.kind, "drawing.status.changed"));
  expect(audit.summary).toContain("P02 (now C01)");

  expect(await createDrawingRevision({ drawingId, commitMessage: "Camera moved on site", bomImpact: true }))
    .toEqual({ ok: true, number: 3, label: "C02" });
  expect((await revisions(drawingId)).map(r => r.label)).toEqual(["P01", "C01", "C02"]);
});

test("a second approval of the same revision keeps its C number", async () => {
  const { drawingId } = await drawing();
  const [p01] = await revisions(drawingId);
  await readyForApproval(p01.id);
  await changeDrawingStatus({ revisionId: p01.id, to: "approved-b", comment: "With comments" });
  expect(await changeDrawingStatus({ revisionId: p01.id, to: "as-built" })).toEqual({ ok: true });
  expect((await revisions(drawingId)).map(r => [r.label, r.cNumber])).toEqual([["C01", 1]]);
});

test("a transmittal keeps the label it was issued under", async () => {
  const { drawingId } = await drawing();
  const [p01] = await revisions(drawingId);
  const site = await ensureUser("viewer");

  expect(await issueDrawingTransmittal({ revisionId: p01.id, purpose: "approval", userIds: [site.id] })).toMatchObject({ ok: true });
  await readyForApproval(p01.id);
  await changeDrawingStatus({ revisionId: p01.id, to: "approved-a" });
  expect(await issueDrawingTransmittal({ revisionId: p01.id, purpose: "construction", userIds: [site.id] })).toMatchObject({ ok: true });

  const stored = await db.select({ label: drawingTransmittals.revisionLabel, purpose: drawingTransmittals.purpose }).from(drawingTransmittals);
  expect(stored.map(t => [t.purpose, t.label]).sort()).toEqual([["approval", "P01"], ["construction", "C01"]]);
  expect((await listTransmittals(drawingId)).map(t => t.revisionLabel).sort()).toEqual(["C01", "P01"]);
});

test("a bulk approval gives each drawing its C number", async () => {
  const a = await drawing("Floor 1");
  const [p] = await db.select().from(projects).limit(1);
  const [disc] = await db.select().from(drawingDisciplines).limit(1);
  const b = await createDrawing({ projectId: p.id, name: "Floor 2", disciplineId: disc.id, ownerId: a.me.id, dueDate: null, estimatedHours: null });
  if (!b.ok) throw new Error(b.error);
  for (const id of [a.drawingId, b.id]) await readyForApproval((await revisions(id))[0].id);

  const r = await bulkChangeDrawingStatus({ ids: [a.drawingId, b.id], to: "approved-a" });
  expect(r).toMatchObject({ ok: true, skipped: [] });
  expect((await revisions(a.drawingId)).map(x => x.label)).toEqual(["C01"]);
  expect((await revisions(b.id)).map(x => x.label)).toEqual(["C01"]);
});

test("the client's approval of a BOM makes it C01, and a draft opened on top of it C02", async () => {
  await mockSession("member");
  const [p] = await db.insert(projects).values({ code: "26TGT", name: "Tegeta Motors" }).returning();
  const [b] = await db.insert(boms).values({ projectId: p.id, name: "Main BOM" }).returning();
  const [p01] = await db.insert(bomRevisions).values({ bomId: b.id, letter: "P01", status: "committed" }).returning();
  const [p02] = await db.insert(bomRevisions).values({ bomId: b.id, letter: "P02", status: "draft", createdAt: new Date(Date.now() + 1000) }).returning();

  expect(await changeRevisionStatus({ revisionId: p01.id, to: "approved", comment: "Signed by the client" })).toEqual({ ok: true });
  const letters = await db.select({ id: bomRevisions.id, letter: bomRevisions.letter }).from(bomRevisions);
  expect(new Map(letters.map(l => [l.id, l.letter]))).toEqual(new Map([[p01.id, "C01"], [p02.id, "C02"]]));

  // Taking the approval back keeps C01.
  expect(await changeRevisionStatus({ revisionId: p01.id, to: "committed", comment: "Approved by mistake" })).toEqual({ ok: true });
  expect((await db.select({ letter: bomRevisions.letter }).from(bomRevisions).where(eq(bomRevisions.id, p01.id)))[0].letter).toBe("C01");
});
