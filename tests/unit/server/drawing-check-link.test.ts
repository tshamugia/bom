import { afterAll, beforeEach, expect, test, vi } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { NextRequest } from "next/server";
import { resetDb } from "@/../tests/test-helpers/db";
import { mockSession } from "@/../tests/test-helpers/auth";
import { db } from "@/db/client";
import {
  SYSTEM_SETTINGS_ID, auditLog, drawingCheckRuns, drawingDisciplines, drawingEvents, drawingRemarks, drawingRevisions,
  drawingTransmittals, drawings, projects, systemSettings,
} from "@/db/schema";
import { CHECK_UPLOAD_BLOCK_MESSAGE } from "@/lib/drawing-checks";
import {
  CHECK_DECIDE_ERROR, SHEET_CODE_FORMAT_ERROR, SHEET_CODE_LOCKED_ERROR, oldProjectCodeReason,
} from "@/lib/drawing-check-link";
import { requireSession } from "@/server/auth-context";

// Issue #18, bulk upload and file-to-drawing linking: sheet codes, the title
// block held against them, "Wrong file", the bulk plan and a busy checker.

const store = vi.hoisted(() => new Map<string, Uint8Array>());
const checker = vi.hoisted(() => ({
  env: {
    DXF_CHECKER_URL: "http://dxf-checker.test:8080",
    DXF_CHECKER_SECRET: "test-checker-secret-0123456789abcdefghij",
    APP_INTERNAL_URL: "http://bom.test:3000",
  } as Record<string, string | undefined>,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }));
vi.mock("next/server", async importOriginal => ({ ...(await importOriginal<typeof import("next/server")>()), after: vi.fn() }));
vi.mock("@/server/auth-context", () => ({ requireSession: vi.fn(), requireRole: vi.fn() }));
vi.mock("@/lib/env", async importOriginal => {
  const real = await importOriginal<typeof import("@/lib/env")>();
  return {
    env: new Proxy(real.env, {
      get: (target, key: string) => (key in checker.env ? checker.env[key] : (target as Record<string, unknown>)[key]),
    }),
  };
});
vi.mock("@/lib/s3", () => ({
  presignUpload: vi.fn(async (key: string) => ({ url: "https://bucket.example/", fields: { key } })),
  presignDownload: vi.fn(async (key: string) => `https://bucket.example/${key}?signed`),
  headObject: vi.fn(async (key: string) => {
    const bytes = store.get(key);
    return bytes ? { size: bytes.length, contentType: "application/dxf" } : null;
  }),
  readObjectStart: vi.fn(async (key: string, n = 1024) => store.get(key)?.subarray(0, n) ?? null),
  deleteObject: vi.fn(async (key: string) => { store.delete(key); }),
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
afterAll(() => vi.unstubAllGlobals());

import {
  confirmDrawingCheckUpload, requestBulkDrawingCheckUpload, requestDrawingCheckUpload,
} from "@/server/actions/drawing-checks";
import {
  confirmDrawingCheckRun, markDrawingCheckWrongFile, planBulkDrawingChecks,
} from "@/server/actions/drawing-check-runs";
import { createDrawing, updateDrawing } from "@/server/actions/drawings";
import { getMyWork } from "@/server/queries/my-work";
import { POST as resultRoute } from "@/app/api/internal/drawing-checks/[id]/result/route";

const SECRET = checker.env.DXF_CHECKER_SECRET!;
const DXF = new TextEncoder().encode("  0\nSECTION\n  2\nHEADER\n  0\nENDSEC\n  0\nEOF\n");
const NAME = "INS-26TGT-ZZ-00-FA-102.dxf";

beforeEach(async () => {
  await resetDb();
  store.clear();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ accepted: true }), { status: 202 }));
});

async function setup() {
  const { user: me } = await mockSession("member");
  const [project] = await db.insert(projects).values({ code: "26TGT", name: "Tegeta" }).returning();
  const make = async (code: string, sheetCode: string | null = null, projectId = project.id) => {
    const [d] = await db.insert(drawings).values({ projectId, code, name: `Drawing ${code}`, ownerId: me.id, sheetCode }).returning();
    const [rev] = await db.insert(drawingRevisions).values({ drawingId: d.id, number: 1, commitMessage: "Initial" }).returning();
    return { drawing: d, rev };
  };
  await db.insert(systemSettings).values({ id: SYSTEM_SETTINGS_ID, drawingCheckEnabled: true });
  return { me, project, make };
}

async function upload(revisionId: string, fileName = NAME) {
  const req = await requestDrawingCheckUpload({ revisionId, fileName, size: DXF.length });
  if (!req.ok) return req;
  store.set(req.fields.key, DXF);
  const done = await confirmDrawingCheckUpload({ runId: req.runId });
  return done.ok ? { ok: true as const, runId: req.runId } : done;
}

async function uploaded(revisionId: string, fileName = NAME) {
  const res = await upload(revisionId, fileName);
  if (!res.ok) throw new Error(res.error);
  return res.runId;
}

const finding = (rule: string, severity: "ERROR" | "WARNING" = "ERROR", message = `${rule} broken`) => ({
  rule, group: null, severity, ref: "NAMING §3", title: `${rule} title`, message, recommendation: `Fix ${rule}`, evidence: "",
});

function callback(runId: string, findings: ReturnType<typeof finding>[], sheetNo: string | null = "FA-102") {
  const body = {
    runId,
    status: "done",
    engineVersion: "1.0.0",
    file: { name: NAME, sizeBytes: DXF.length, sha256: "ab".repeat(32) },
    findings,
    parsedName: { project: "26TGT", sheetCode: "ZZ-00-FA-102", sheet: "FA-102" },
    titleblock: sheetNo === null ? null : { source: "block", values: { sheet_no: sheetNo } },
  };
  return resultRoute(
    new NextRequest(`http://bom.test:3000/api/internal/drawing-checks/${runId}/result`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${SECRET}` },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: runId }) },
  );
}

const openRules = async (drawingId: string) =>
  (await db
    .select({ rule: drawingRemarks.checkRuleId })
    .from(drawingRemarks)
    .where(and(eq(drawingRemarks.drawingId, drawingId), isNull(drawingRemarks.resolvedAt)))
    .orderBy(drawingRemarks.checkRuleId)).map(r => r.rule);

const runOf = async (runId: string) => (await db.select().from(drawingCheckRuns).where(eq(drawingCheckRuns.id, runId)))[0];
/** The drawing goes out (NAMING §5's "first issue"): a transmittal to someone outside the app. */
const issue = (drawingId: string, revisionId: string) =>
  db.insert(drawingTransmittals).values({ drawingId, revisionId, purpose: "information", externalName: "Site" });
const sheetOf = async (drawingId: string) =>
  (await db.select({ sheetCode: drawings.sheetCode }).from(drawings).where(eq(drawings.id, drawingId)))[0].sheetCode;

// ── Linking ────────────────────────────────────────────────────────────────

test("the first standard-named DXF gives the drawing its sheet code; later files must carry it", async () => {
  const { make } = await setup();
  const { drawing, rev } = await make("FA-1");
  const runId = await uploaded(rev.id);

  expect(await sheetOf(drawing.id)).toBe("ZZ-00-FA-102");
  expect((await runOf(runId)).linkedSheetCode).toBe("ZZ-00-FA-102");
  const [event] = await db.select().from(drawingEvents).where(eq(drawingEvents.kind, "updated"));
  expect(event.body).toBe(`Sheet code: — → ZZ-00-FA-102 (from ${NAME})`);
  const [log] = await db.select().from(auditLog).where(eq(auditLog.kind, "drawing.updated"));
  expect(log.summary).toBe("FA-1 updated — sheet code");

  await callback(runId, []);
  const other = await upload(rev.id, "INS-26TGT-ZZ-00-FA-103.dxf");
  expect(other).toMatchObject({ ok: false, error: expect.stringContaining("is sheet ZZ-00-FA-103, but this drawing is ZZ-00-FA-102") });
  const project = await upload(rev.id, "INS-26ABC-ZZ-00-FA-102.dxf");
  expect(project).toMatchObject({ ok: false, error: expect.stringContaining("project 26ABC") });
  // A name off the standard is the uploader's call.
  expect((await upload(rev.id, "fire alarm.dxf")).ok).toBe(true);
});

test("a sheet code another drawing of the project has can't be linked", async () => {
  const { make } = await setup();
  await make("FA-1", "ZZ-00-FA-102");
  const { drawing, rev } = await make("FA-2");
  expect(await upload(rev.id)).toEqual({ ok: false, error: "ZZ-00-FA-102 is already the sheet code of FA-1 in this project." });
  expect(await sheetOf(drawing.id)).toBeNull();
});

test("sheet codes are typed in the drawing form, checked and unique per project", async () => {
  const { me, project } = await setup();
  const [disc] = await db.insert(drawingDisciplines).values({ name: `Fire ${Date.now()}` }).returning();
  const fields = { projectId: project.id, name: "Fire alarm", disciplineId: disc.id, ownerId: me.id, dueDate: null, estimatedHours: null };
  const a = await createDrawing({ ...fields, sheetCode: " zz-00-fa-102 " });
  if (!a.ok) throw new Error(a.error);
  expect(await sheetOf(a.id)).toBe("ZZ-00-FA-102");

  const b = await createDrawing({ ...fields, name: "Fire alarm 2" });
  if (!b.ok) throw new Error(b.error);
  expect(await updateDrawing({ ...fields, id: b.id, name: "Fire alarm 2", sheetCode: "FA-102" })).toEqual({ ok: false, error: SHEET_CODE_FORMAT_ERROR });
  expect(await updateDrawing({ ...fields, id: b.id, name: "Fire alarm 2", sheetCode: "ZZ-00-FA-102" }))
    .toEqual({ ok: false, error: `ZZ-00-FA-102 is already the sheet code of ${a.code} in this project.` });
  expect(await updateDrawing({ ...fields, id: b.id, name: "Fire alarm 2", sheetCode: "ZZ-01-FA-102" })).toEqual({ ok: true });
  // Another project may use the same code.
  const [other] = await db.insert(projects).values({ code: "26BMW", name: "BMW" }).returning();
  expect(await updateDrawing({ ...fields, id: a.id, projectId: other.id })).toEqual({ ok: true });

  const [event] = await db.select({ body: drawingEvents.body }).from(drawingEvents)
    .where(and(eq(drawingEvents.drawingId, b.id), eq(drawingEvents.kind, "updated")));
  expect(event.body).toBe("Sheet code: — → ZZ-01-FA-102");
});

test("after the first issue only an admin changes a sheet code; giving one to a drawing without stays open", async () => {
  const { me, project } = await setup();
  const [disc] = await db.insert(drawingDisciplines).values({ name: `Fire ${Date.now()}` }).returning();
  const fields = { projectId: project.id, name: "Fire alarm", disciplineId: disc.id, ownerId: me.id, dueDate: null, estimatedHours: null };
  const a = await createDrawing({ ...fields, sheetCode: "ZZ-00-FA-102" });
  const b = await createDrawing({ ...fields, name: "Fire alarm 2" });
  if (!a.ok || !b.ok) throw new Error("create failed");
  const revOf = async (id: string) => (await db.select().from(drawingRevisions).where(eq(drawingRevisions.drawingId, id)))[0];
  await issue(a.id, (await revOf(a.id)).id);
  await issue(b.id, (await revOf(b.id)).id);

  // Before the first issue it was anyone's; now a member can't change or clear it…
  expect(await updateDrawing({ ...fields, id: a.id, sheetCode: "ZZ-00-FA-104" })).toEqual({ ok: false, error: SHEET_CODE_LOCKED_ERROR });
  expect(await updateDrawing({ ...fields, id: a.id, sheetCode: null })).toEqual({ ok: false, error: SHEET_CODE_LOCKED_ERROR });
  // …but other fields still save, and a drawing issued without one gets its first.
  expect(await updateDrawing({ ...fields, id: a.id, sheetCode: "ZZ-00-FA-102", name: "Fire alarm L0" })).toEqual({ ok: true });
  expect(await updateDrawing({ ...fields, id: b.id, name: "Fire alarm 2", sheetCode: "ZZ-00-FA-105" })).toEqual({ ok: true });
  expect(await sheetOf(b.id)).toBe("ZZ-00-FA-105");

  const { user: admin } = await mockSession("admin");
  expect(await updateDrawing({ ...fields, id: a.id, name: "Fire alarm L0", sheetCode: "ZZ-00-FA-104" })).toEqual({ ok: true });
  expect(await sheetOf(a.id)).toBe("ZZ-00-FA-104");
  // The trail marks the renumbering NAMING §5 leaves to admins.
  const logs = await db.select().from(auditLog).where(and(eq(auditLog.kind, "drawing.updated"), eq(auditLog.refId, a.id)));
  const afterIssue = logs.filter(l => (l.payload as { sheetCodeAfterIssue?: boolean }).sheetCodeAfterIssue);
  expect(logs).toHaveLength(2);
  expect(afterIssue.map(l => l.actorId)).toEqual([admin.id]);
});

// ── Title block ────────────────────────────────────────────────────────────

test("a title block naming another sheet changes nothing and waits for the uploader", async () => {
  const { make } = await setup();
  const { drawing, rev } = await make("FA-1");
  const first = await uploaded(rev.id);
  await callback(first, [finding("D15-UNITS")]);
  expect(await openRules(drawing.id)).toEqual(["D15-UNITS"]);

  const second = await uploaded(rev.id);
  expect((await callback(second, [finding("D06-DUPLICATE")], "FA-104")).status).toBe(200);
  expect(await runOf(second)).toMatchObject({ status: "held", sheetCheck: "mismatch", remarkChanges: null, appliedAt: null });
  expect(await openRules(drawing.id)).toEqual(["D15-UNITS"]);
  expect(store.size).toBe(0);

  const work = await getMyWork();
  expect(work.checks).toEqual([expect.objectContaining({ runId: second, titleBlockSheet: "FA-104", sheetCode: "ZZ-00-FA-102" })]);
  expect(work.counts.checks).toBe(1);

  await mockSession("viewer");
  expect(await confirmDrawingCheckRun({ runId: second })).toEqual({ ok: false, error: "Viewers have read-only access." });
  expect(await markDrawingCheckWrongFile({ runId: second })).toEqual({ ok: false, error: "Viewers have read-only access." });

  // Another member is neither the uploader nor the owner.
  await mockSession("member");
  expect(await confirmDrawingCheckRun({ runId: second })).toEqual({ ok: false, error: CHECK_DECIDE_ERROR });
  expect(await markDrawingCheckWrongFile({ runId: second })).toEqual({ ok: false, error: CHECK_DECIDE_ERROR });
  expect(await runOf(second)).toMatchObject({ status: "held", decidedById: null });

  const { user: admin } = await mockSession("admin");
  expect(await confirmDrawingCheckRun({ runId: second })).toMatchObject({ ok: true });
  expect(await runOf(second)).toMatchObject({ status: "done", decidedById: admin.id });
  expect(await openRules(drawing.id)).toEqual(["D06-DUPLICATE"]);
  const [log] = await db.select().from(auditLog).where(eq(auditLog.kind, "drawing.check.confirmed"));
  expect(log.actorId).toBe(admin.id);
  expect(await confirmDrawingCheckRun({ runId: second })).toMatchObject({ ok: false });
});

test("the drawing's owner decides about a check someone else uploaded", async () => {
  const { project } = await setup();
  const owner = await mockSession("member");
  const [d] = await db.insert(drawings).values({ projectId: project.id, code: "FA-5", name: "Drawing FA-5", ownerId: owner.user.id }).returning();
  const [rev] = await db.insert(drawingRevisions).values({ drawingId: d.id, number: 1, commitMessage: "Initial" }).returning();

  await mockSession("member");
  const runId = await uploaded(rev.id);
  await callback(runId, [finding("D15-UNITS")], "FA-104");
  expect((await runOf(runId)).status).toBe("held");

  vi.mocked(requireSession).mockResolvedValue(owner.session as never);
  expect(await markDrawingCheckWrongFile({ runId })).toMatchObject({ ok: true });
  expect(await runOf(runId)).toMatchObject({ status: "wrong-file", decidedById: owner.user.id });
});

test("an unreadable title block writes new remarks but closes none", async () => {
  const { make } = await setup();
  const { drawing, rev } = await make("FA-1");
  const first = await uploaded(rev.id);
  await callback(first, [finding("D15-UNITS")]);
  const second = await uploaded(rev.id);
  await callback(second, [finding("D06-DUPLICATE")], null);
  expect(await openRules(drawing.id)).toEqual(["D06-DUPLICATE", "D15-UNITS"]);
  expect((await runOf(second)).sheetCheck).toBe("unreadable");
});

test("a held run can't be confirmed once a later check came in", async () => {
  const { make } = await setup();
  const { rev } = await make("FA-1");
  const held = await uploaded(rev.id);
  await callback(held, [finding("D15-UNITS")], "FA-104");
  const later = await uploaded(rev.id);
  await callback(later, []);
  expect(await confirmDrawingCheckRun({ runId: held })).toMatchObject({ ok: false, error: expect.stringContaining("later check") });
  expect(await markDrawingCheckWrongFile({ runId: held })).toMatchObject({ ok: true, summary: "nothing had changed" });
  expect((await runOf(held)).status).toBe("wrong-file");
});

// ── Wrong file ─────────────────────────────────────────────────────────────

test("wrong file undoes the latest check: new remarks go, closed ones reopen, updated ones get their text back", async () => {
  const { make } = await setup();
  const { drawing, rev } = await make("FA-1");
  const first = await uploaded(rev.id);
  await callback(first, [finding("D15-UNITS"), finding("T-SHEET", "ERROR", "before")]);
  const [sheetBefore] = await db.select().from(drawingRemarks).where(eq(drawingRemarks.checkRuleId, "T-SHEET"));

  // Linked by hand on another drawing first: its sheet code goes back too.
  const second = await uploaded(rev.id);
  await callback(second, [finding("T-SHEET", "WARNING", "after"), finding("D06-DUPLICATE")]);
  expect(await openRules(drawing.id)).toEqual(["D06-DUPLICATE", "T-SHEET"]);

  expect(await markDrawingCheckWrongFile({ runId: first })).toMatchObject({ ok: false, error: expect.stringContaining("only the latest") });
  expect(await markDrawingCheckWrongFile({ runId: second })).toEqual({
    ok: true,
    summary: "1 new remark removed, 1 closed remark reopened, 1 remark restored",
  });
  expect(await openRules(drawing.id)).toEqual(["D15-UNITS", "T-SHEET"]);
  const [sheet] = await db.select().from(drawingRemarks).where(eq(drawingRemarks.checkRuleId, "T-SHEET"));
  expect(sheet).toMatchObject({ body: sheetBefore.body, checkSeverity: "ERROR", lastCheckRunId: first });
  const [units] = await db.select().from(drawingRemarks).where(eq(drawingRemarks.checkRuleId, "D15-UNITS"));
  expect(units).toMatchObject({ resolvedAt: null, resolvedInRevisionId: null, resolution: null, lastCheckRunId: first });
  expect(await runOf(second)).toMatchObject({ status: "wrong-file" });
  const [log] = await db.select().from(auditLog).where(eq(auditLog.kind, "drawing.check.wrong-file"));
  expect(log.payload).toMatchObject({ removed: 1, reopened: 1, restored: 1, kept: 0 });

  // Now the first check is the latest one: undoing it removes its remarks and the sheet code it linked.
  expect(await markDrawingCheckWrongFile({ runId: first })).toMatchObject({ ok: true });
  expect(await openRules(drawing.id)).toEqual([]);
  expect(await sheetOf(drawing.id)).toBeNull();
});

test("once the drawing has been issued, a wrong file keeps the sheet code it linked unless an admin marks it", async () => {
  const { make } = await setup();
  const { drawing, rev } = await make("FA-1");
  const runId = await uploaded(rev.id);
  await callback(runId, [finding("D15-UNITS")]);
  await issue(drawing.id, rev.id);

  const res = await markDrawingCheckWrongFile({ runId });
  expect(res).toEqual({
    ok: true,
    summary: "1 new remark removed. The sheet code ZZ-00-FA-102 stays: the drawing has been issued, so only an admin can change it.",
  });
  expect(await sheetOf(drawing.id)).toBe("ZZ-00-FA-102");
  const [log] = await db.select().from(auditLog).where(eq(auditLog.kind, "drawing.check.wrong-file"));
  expect(log.payload).toMatchObject({ keptSheetCode: "ZZ-00-FA-102" });
  expect(log.payload).not.toHaveProperty("unlinkedSheetCode");

  // The same on a second drawing, decided by an admin: the code goes.
  const other = await make("FA-2");
  const second = await uploaded(other.rev.id, "INS-26TGT-ZZ-00-FA-103.dxf");
  await callback(second, [], "FA-103");
  await issue(other.drawing.id, other.rev.id);
  await mockSession("admin");
  expect(await markDrawingCheckWrongFile({ runId: second })).toMatchObject({ ok: true, summary: "nothing had changed" });
  expect(await sheetOf(other.drawing.id)).toBeNull();
});

test("remarks someone resolved by hand stay as they are", async () => {
  const { make } = await setup();
  const { drawing, rev } = await make("FA-1");
  const runId = await uploaded(rev.id);
  await callback(runId, [finding("D15-UNITS")]);
  await db.update(drawingRemarks).set({ resolvedAt: new Date(), resolution: "by hand" }).where(eq(drawingRemarks.drawingId, drawing.id));
  expect(await markDrawingCheckWrongFile({ runId })).toMatchObject({ ok: true, summary: "1 left as they are (changed by hand since)" });
  expect(await db.select().from(drawingRemarks)).toHaveLength(1);
});

// ── Bulk ───────────────────────────────────────────────────────────────────

test("the server plan stops what only it can see, and refuses viewers and switched-off checks", async () => {
  const { make, project } = await setup();
  const a = await make("FA-1", "ZZ-00-FA-101");
  const b = await make("FA-2");
  await make("FA-9", "ZZ-00-FA-109");
  const [old] = await db.insert(projects).values({ code: "BS-005", name: "Old" }).returning();
  const c = await make("FA-3", null, old.id);
  // A check of FA-1 is still running.
  await uploaded(a.rev.id, "INS-26TGT-ZZ-00-FA-101.dxf");

  const res = await planBulkDrawingChecks({
    drawingIds: [a.drawing.id, b.drawing.id, c.drawing.id],
    files: [
      { key: "1", name: "INS-26TGT-ZZ-00-FA-101.dxf", size: 10 },
      { key: "2", name: "INS-26TGT-ZZ-00-FA-109.dxf", size: 10 },
      { key: "3", name: "INS-26TGT-ZZ-00-FA-110.dxf", size: 10 },
    ],
    picks: { 3: b.drawing.id },
  });
  if (!res.ok) throw new Error(res.error);
  expect(res.plan.items.map(i => [i.key, i.state, i.drawingId, i.reason])).toEqual([
    ["1", "stopped", null, `FA-1: ${CHECK_UPLOAD_BLOCK_MESSAGE.RUNNING}`],
    ["2", "stopped", null, "ZZ-00-FA-109 is the sheet code of FA-9, which isn't selected."],
    ["3", "ready", b.drawing.id, null],
  ]);
  expect(res.plan.blocked).toEqual([{ id: c.drawing.id, code: "FA-3", reason: oldProjectCodeReason("BS-005") }]);
  expect(project.code).toBe("26TGT");

  expect(await requestBulkDrawingCheckUpload({ drawingId: c.drawing.id, fileName: "plan.dxf", size: 10 }))
    .toEqual({ ok: false, error: oldProjectCodeReason("BS-005") });

  await mockSession("viewer");
  expect(await planBulkDrawingChecks({ drawingIds: [b.drawing.id], files: [{ key: "1", name: "a.dxf", size: 1 }] }))
    .toEqual({ ok: false, error: "Viewers have read-only access." });
  await mockSession("member");
  await db.update(systemSettings).set({ drawingCheckEnabled: false });
  expect(await planBulkDrawingChecks({ drawingIds: [b.drawing.id], files: [{ key: "1", name: "a.dxf", size: 1 }] }))
    .toEqual({ ok: false, error: CHECK_UPLOAD_BLOCK_MESSAGE.DISABLED });
});

test("a bulk file goes to the drawing's latest revision and links its sheet code", async () => {
  const { make } = await setup();
  const { drawing } = await make("FA-1");
  const [rev2] = await db.insert(drawingRevisions).values({ drawingId: drawing.id, number: 2, commitMessage: "Two" }).returning();
  const req = await requestBulkDrawingCheckUpload({ drawingId: drawing.id, fileName: "INS-26TGT-ZZ-00-FA-110.dxf", size: DXF.length });
  if (!req.ok) throw new Error(req.error);
  store.set(req.fields.key, DXF);
  expect(await confirmDrawingCheckUpload({ runId: req.runId, retryWhenBusy: true })).toEqual({ ok: true });
  expect(await runOf(req.runId)).toMatchObject({ revisionId: rev2.id, status: "queued", linkedSheetCode: "ZZ-00-FA-110" });
});

test("a busy checker puts a bulk file back to wait instead of failing it", async () => {
  const { make } = await setup();
  const { drawing } = await make("FA-1");
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ detail: "busy" }), { status: 503 }));
  const req = await requestBulkDrawingCheckUpload({ drawingId: drawing.id, fileName: NAME, size: DXF.length });
  if (!req.ok) throw new Error(req.error);
  store.set(req.fields.key, DXF);

  expect(await confirmDrawingCheckUpload({ runId: req.runId, retryWhenBusy: true })).toMatchObject({ ok: false, busy: true });
  expect(await runOf(req.runId)).toMatchObject({ status: "pending", startedAt: null, linkedSheetCode: "ZZ-00-FA-102" });
  expect(store.size).toBe(1);

  expect(await confirmDrawingCheckUpload({ runId: req.runId, retryWhenBusy: true })).toEqual({ ok: true });
  expect(await runOf(req.runId)).toMatchObject({ status: "queued", linkedSheetCode: "ZZ-00-FA-102" });
  expect(await sheetOf(drawing.id)).toBe("ZZ-00-FA-102");
});
