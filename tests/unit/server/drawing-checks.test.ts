import { afterAll, beforeEach, expect, test, vi } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { NextRequest } from "next/server";
import { resetDb } from "@/../tests/test-helpers/db";
import { mockSession } from "@/../tests/test-helpers/auth";
import { db } from "@/db/client";
import {
  SYSTEM_SETTINGS_ID, auditLog, drawingCheckConfig, drawingCheckRuns, drawingEvents, drawingRemarks, drawingRevisions,
  drawings, projects, systemSettings,
} from "@/db/schema";
import { CHECK_RULE_IDS } from "@/lib/drawing-check-rules";
import { CHECK_UPLOAD_BLOCK_MESSAGE } from "@/lib/drawing-checks";
import type { DrawingStatus } from "@/lib/drawing-status";

const store = vi.hoisted(() => new Map<string, Uint8Array>());
const checker = vi.hoisted(() => ({
  env: {
    DXF_CHECKER_URL: "http://dxf-checker.test:8080",
    DXF_CHECKER_SECRET: "test-checker-secret-0123456789abcdefghij",
    APP_INTERNAL_URL: "http://bom.test:3000",
  } as Record<string, string | undefined>,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), refresh: vi.fn() }));
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
  cancelDrawingCheckUpload, confirmDrawingCheckUpload, requestDrawingCheckUpload,
} from "@/server/actions/drawing-checks";
import { setDrawingCheckEnabled } from "@/server/actions/drawing-settings";
import { addDrawingRemark, reopenDrawingRemark, resolveDrawingRemark } from "@/server/actions/drawing-remarks";
import { getMyWork } from "@/server/queries/my-work";
import { POST as resultRoute } from "@/app/api/internal/drawing-checks/[id]/result/route";

const SECRET = checker.env.DXF_CHECKER_SECRET!;
const bytes = (s: string) => new TextEncoder().encode(s);
const DXF = bytes("  0\nSECTION\n  2\nHEADER\n  0\nENDSEC\n  0\nEOF\n");
const DWG = bytes("AC1032\u0000\u0000\u0000\u0000\u0000binary");
const NAME = "INS-26TGT-ZZ-00-FA-102.dxf";

beforeEach(async () => {
  await resetDb();
  store.clear();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ accepted: true }), { status: 202 }));
  checker.env.DXF_CHECKER_URL = "http://dxf-checker.test:8080";
  checker.env.DXF_CHECKER_SECRET = SECRET;
  checker.env.APP_INTERNAL_URL = "http://bom.test:3000";
});

/** A drawing owned by the signed-in member, with P01 in `status`, and checks switched on. */
async function setup(status: DrawingStatus = "in-progress", { enabled = true } = {}) {
  const { user: owner } = await mockSession("member");
  const [project] = await db.insert(projects).values({ code: "26TGT", name: "Tegeta" }).returning();
  const [drawing] = await db.insert(drawings).values({ projectId: project.id, code: "FA-102", name: "Fire alarm", ownerId: owner.id }).returning();
  const [rev] = await db.insert(drawingRevisions).values({ drawingId: drawing.id, number: 1, commitMessage: "Initial", status }).returning();
  await db.insert(systemSettings).values({ id: SYSTEM_SETTINGS_ID, drawingCheckEnabled: enabled });
  return { owner, project, drawing, rev };
}

async function newRevision(drawingId: string, number: number) {
  const [rev] = await db.insert(drawingRevisions).values({ drawingId, number, commitMessage: `Rev ${number}`, status: "in-progress" }).returning();
  return rev;
}

/** What the browser does: ask for the form, post the bytes to the bucket, confirm. */
async function upload(revisionId: string, file = DXF, fileName = NAME) {
  const req = await requestDrawingCheckUpload({ revisionId, fileName, size: file.length });
  if (!req.ok) return req;
  store.set(req.fields.key, file);
  const done = await confirmDrawingCheckUpload({ runId: req.runId });
  return done.ok ? { ok: true as const, runId: req.runId } : done;
}

async function uploaded(revisionId: string, file = DXF, fileName = NAME) {
  const res = await upload(revisionId, file, fileName);
  if (!res.ok) throw new Error(res.error);
  return res.runId;
}

/** What the checker posted for the last run. */
function sentBody() {
  const [url, init] = fetchMock.mock.calls.at(-1)!;
  return { url: String(url), headers: (init as RequestInit).headers as Record<string, string>, body: JSON.parse(String((init as RequestInit).body)) };
}

const finding = (rule: string, severity: "ERROR" | "WARNING" | "INFO", message = `${rule} broken`) => ({
  rule, group: null, severity, ref: "NAMING §3", title: `${rule} title`, message, recommendation: `Fix ${rule}`, evidence: "",
});

const doneResult = (runId: string, findings: ReturnType<typeof finding>[], extra: Record<string, unknown> = {}) => ({
  runId,
  status: "done",
  errorCode: null,
  error: null,
  engineVersion: "1.0.0",
  standards: { naming: "0.0.3", drafting: "0.0.5" },
  file: { name: NAME, sizeBytes: DXF.length, sha256: "ab".repeat(32) },
  durationMs: 840,
  counts: {},
  findings,
  parsedName: { project: "26TGT", sheetCode: "ZZ-00-FA-102", sheet: "FA-102", revision: null },
  titleblock: { source: "block", block: "TB", values: { sheet_no: "FA-102" } },
  stats: { insunits: 4 },
  ignoredRules: [],
  ...extra,
});

function callback(runId: string, body: unknown, authorization: string | null = `Bearer ${SECRET}`) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (authorization) headers.authorization = authorization;
  return resultRoute(
    new NextRequest(`http://bom.test:3000/api/internal/drawing-checks/${runId}/result`, {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: runId }) },
  );
}

const openRemarks = (drawingId: string) =>
  db.select().from(drawingRemarks).where(and(eq(drawingRemarks.drawingId, drawingId), isNull(drawingRemarks.resolvedAt))).orderBy(drawingRemarks.checkRuleId);

const runOf = async (runId: string) => (await db.select().from(drawingCheckRuns).where(eq(drawingCheckRuns.id, runId)))[0];

// ── Who and when ────────────────────────────────────────────────────────────

test("viewers can't check a DXF", async () => {
  const { rev } = await setup();
  const runId = await uploaded(rev.id);

  await mockSession("viewer");
  expect(await requestDrawingCheckUpload({ revisionId: rev.id, fileName: NAME, size: 10 })).toEqual({ ok: false, error: "Viewers have read-only access." });
  expect(await confirmDrawingCheckUpload({ runId })).toEqual({ ok: false, error: "Viewers have read-only access." });
  expect(await cancelDrawingCheckUpload({ runId })).toEqual({ ok: false, error: "Viewers have read-only access." });
});

test("while checks are off the server refuses uploads, admins included", async () => {
  const { rev } = await setup("in-progress", { enabled: false });
  await mockSession("admin");
  expect(await upload(rev.id)).toEqual({ ok: false, error: CHECK_UPLOAD_BLOCK_MESSAGE.DISABLED });
  expect(await db.select().from(drawingCheckRuns)).toEqual([]);
  expect(fetchMock).not.toHaveBeenCalled();
});

test("without the checker's address, secret and callback address nothing is uploaded", async () => {
  const { rev } = await setup();
  checker.env.APP_INTERNAL_URL = undefined;
  expect(await upload(rev.id)).toEqual({ ok: false, error: CHECK_UPLOAD_BLOCK_MESSAGE.NOT_CONFIGURED });
});

test("only an admin switches checks on and off", async () => {
  await setup("in-progress", { enabled: false });
  expect(await setDrawingCheckEnabled({ enabled: true })).toEqual({ ok: false, error: "Only an admin can do this." });
  await mockSession("admin");
  expect(await setDrawingCheckEnabled({ enabled: true })).toEqual({ ok: true });
  const [row] = await db.select().from(systemSettings);
  expect(row.drawingCheckEnabled).toBe(true);
  const [log] = await db.select().from(auditLog).where(eq(auditLog.kind, "drawing.check.settings.changed"));
  expect(log.summary).toBe("Automatic DXF checks turned on");
});

test("any editor checks the latest revision; the checker gets the file, the rules and where to answer", async () => {
  const { drawing, rev } = await setup("approved-a");
  // Not the owner — any member may check.
  await mockSession("member");
  const runId = await uploaded(rev.id);

  const sent = sentBody();
  expect(sent.url).toBe("http://dxf-checker.test:8080/v1/checks");
  expect(sent.headers.authorization).toBe(`Bearer ${SECRET}`);
  expect(sent.body).toEqual({
    runId,
    file: { url: `https://bucket.example/checks/${runId}.dxf?signed`, name: NAME, sizeBytes: DXF.length },
    context: { role: "issued" },
    rules: { enabled: [...CHECK_RULE_IDS], severity: {}, params: {} },
    callbackUrl: `http://bom.test:3000/api/internal/drawing-checks/${runId}/result`,
  });

  const run = await runOf(runId);
  expect(run).toMatchObject({ status: "queued", drawingId: drawing.id, revisionLabel: "P01", originalName: NAME, sizeBytes: DXF.length, configVersion: 0 });
  expect(run.startedAt).toBeInstanceOf(Date);
  const [log] = await db.select().from(auditLog).where(eq(auditLog.kind, "drawing.check.requested"));
  expect(log.summary).toBe(`FA-102 P01 DXF check requested — ${NAME} (${DXF.length} B)`);
});

test("an older revision can't be checked", async () => {
  const { drawing, rev } = await setup();
  await newRevision(drawing.id, 2);
  expect(await upload(rev.id)).toEqual({ ok: false, error: CHECK_UPLOAD_BLOCK_MESSAGE.NOT_LATEST });
});

test("a DWG — by name or renamed to .dxf — is sent back with how to save a DXF, and nothing is kept", async () => {
  const { rev } = await setup();
  const byName = await requestDrawingCheckUpload({ revisionId: rev.id, fileName: "plan.dwg", size: 10 });
  expect(byName).toEqual({ ok: false, error: expect.stringContaining("SAVEAS → AutoCAD 2018 DXF") });

  const renamed = await upload(rev.id, DWG);
  expect(renamed).toEqual({ ok: false, error: expect.stringMatching(/DWG renamed to \.dxf.*SAVEAS/) });
  expect(await db.select().from(drawingCheckRuns)).toEqual([]);
  expect(store.size).toBe(0);
  expect(fetchMock).not.toHaveBeenCalled();
});

test("one check at a time per revision; an abandoned upload of my own doesn't block me", async () => {
  const { rev } = await setup();
  const first = await requestDrawingCheckUpload({ revisionId: rev.id, fileName: NAME, size: DXF.length });
  expect(first.ok).toBe(true);
  // The same person starts over (the tab was closed mid-upload).
  await uploaded(rev.id);
  expect(await db.select().from(drawingCheckRuns)).toHaveLength(1);

  await mockSession("member");
  expect(await upload(rev.id)).toEqual({ ok: false, error: CHECK_UPLOAD_BLOCK_MESSAGE.RUNNING });
});

test("when the checker is down the run fails, the file goes and the next upload works", async () => {
  const { drawing, rev } = await setup();
  fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));

  expect(await upload(rev.id)).toEqual({ ok: false, error: "The checker didn't answer — try again in a few minutes." });
  const [run] = await db.select().from(drawingCheckRuns);
  expect(run).toMatchObject({ status: "failed", errorCode: "UNREACHABLE" });
  expect(store.size).toBe(0);
  expect(await openRemarks(drawing.id)).toEqual([]);

  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ detail: "busy" }), { status: 503 }));
  expect(await upload(rev.id)).toEqual({ ok: false, error: "The checker is busy — try again in a minute." });
  expect((await upload(rev.id)).ok).toBe(true);
});

test("a check the checker lost is closed after an hour and frees the revision", async () => {
  const { rev } = await setup();
  const lost = await uploaded(rev.id);
  await db.update(drawingCheckRuns).set({ startedAt: new Date(Date.now() - 2 * 3_600_000) }).where(eq(drawingCheckRuns.id, lost));

  expect((await upload(rev.id)).ok).toBe(true);
  expect(await runOf(lost)).toMatchObject({ status: "failed", errorCode: "STALE" });
  // The checker's late answer is refused for good.
  expect((await callback(lost, doneResult(lost, []))).status).toBe(409);
});

// ── The callback ────────────────────────────────────────────────────────────

test("the callback only takes the checker's secret", async () => {
  const { rev } = await setup();
  const runId = await uploaded(rev.id);
  const body = doneResult(runId, []);

  expect((await callback(runId, body, null)).status).toBe(401);
  expect((await callback(runId, body, "Bearer wrong")).status).toBe(401);
  expect((await callback(runId, body, `Bearer ${SECRET.slice(0, -1)}x`)).status).toBe(401);
  expect((await callback(runId, body, `Basic ${SECRET}`)).status).toBe(401);
  expect((await runOf(runId)).status).toBe("queued");

  // An app without a secret takes no callback at all.
  checker.env.DXF_CHECKER_SECRET = undefined;
  expect((await callback(runId, body)).status).toBe(401);
  checker.env.DXF_CHECKER_SECRET = SECRET;
  expect((await callback(runId, body)).status).toBe(200);
});

test("findings become automatic remarks for the owner; INFO stays in the report; the DXF is deleted", async () => {
  const { owner, drawing, rev } = await setup();
  const runId = await uploaded(rev.id);
  const key = `checks/${runId}.dxf`;
  expect(store.has(key)).toBe(true);

  const res = await callback(runId, doneResult(runId, [
    finding("T-SHEET", "ERROR", "შტამპში FA-104, სახელში FA-102."),
    finding("T-SHEET", "ERROR", "მეორე ფურცელი."),
    finding("D02-COPY-BLOCK", "WARNING"),
    finding("D11-LEGEND-UNITS", "INFO"),
  ]));
  expect(res.status).toBe(200);

  const remarks = await openRemarks(drawing.id);
  expect(remarks.map(r => [r.checkRuleId, r.checkSeverity, r.source, r.raisedById, r.revisionId, r.lastCheckRunId])).toEqual([
    ["D02-COPY-BLOCK", "WARNING", "check", null, rev.id, runId],
    ["T-SHEET", "ERROR", "check", null, rev.id, runId],
  ]);
  expect(remarks[1].body).toBe("T-SHEET title (NAMING §3)\n\n• შტამპში FA-104, სახელში FA-102.\n• მეორე ფურცელი.\n\n→ Fix T-SHEET");

  const run = await runOf(runId);
  expect(run).toMatchObject({ status: "done", counts: { ERROR: 2, WARNING: 1, INFO: 1 }, sha256: "ab".repeat(32), engineVersion: "1.0.0" });
  expect(run.findings).toHaveLength(4);
  expect(run.remarkChanges).toEqual({ created: expect.any(Array), updated: [], closed: [], previous: [] });
  expect(run.remarkChanges!.created).toHaveLength(2);
  expect(run.details?.parsedName).toMatchObject({ sheetCode: "ZZ-00-FA-102" });
  expect(store.has(key)).toBe(false);

  const [event] = await db.select().from(drawingEvents).where(eq(drawingEvents.kind, "check"));
  expect(event).toMatchObject({ revisionId: rev.id, actorId: owner.id, body: `Checked ${NAME}: 2 errors, 1 to check, 1 info. Remarks: 2 new` });
  const [log] = await db.select().from(auditLog).where(eq(auditLog.kind, "drawing.check.finished"));
  expect(log).toMatchObject({ actorId: null, summary: "FA-102 P01 DXF checked — 2 errors, 1 to check, 1 info" });

  // The owner finds them in My work.
  const work = await getMyWork();
  expect(work.remarks).toEqual([expect.objectContaining({ drawingId: drawing.id, open: 2 })]);
  expect(work.updates.filter(u => u.kind === "remark").map(u => [u.actorName, u.verb])).toEqual([
    ["Automatic check", "raised a remark on"],
    ["Automatic check", "raised a remark on"],
  ]);
});

test("checking again updates what is still wrong, closes what was fixed and never duplicates", async () => {
  const { drawing, rev } = await setup();
  const first = await uploaded(rev.id);
  await callback(first, doneResult(first, [finding("T-SHEET", "ERROR", "first"), finding("D15-UNITS", "ERROR")]));
  const [sheetBefore] = (await openRemarks(drawing.id)).filter(r => r.checkRuleId === "T-SHEET");

  const rev2 = await newRevision(drawing.id, 2);
  const second = await uploaded(rev2.id);
  expect((await callback(second, doneResult(second, [finding("T-SHEET", "WARNING", "second"), finding("D06-DUPLICATE", "ERROR")]))).status).toBe(200);

  const open = await openRemarks(drawing.id);
  expect(open.map(r => r.checkRuleId)).toEqual(["D06-DUPLICATE", "T-SHEET"]);
  const sheet = open.find(r => r.checkRuleId === "T-SHEET")!;
  expect(sheet.id).toBe(sheetBefore.id);
  expect(sheet).toMatchObject({ checkSeverity: "WARNING", lastCheckRunId: second, revisionId: rev.id });
  expect(sheet.body).toContain("• second");

  const [units] = await db.select().from(drawingRemarks).where(eq(drawingRemarks.checkRuleId, "D15-UNITS"));
  expect(units).toMatchObject({ resolvedInRevisionId: rev2.id, resolvedById: null, lastCheckRunId: second });
  expect(units.resolvedAt).toBeInstanceOf(Date);
  expect(units.resolution).toBe(`Fixed — the automatic check of P02 (${NAME}) passed.`);
  expect(await db.select().from(drawingRemarks)).toHaveLength(3);
  expect((await runOf(second)).remarkChanges).toEqual({
    created: [expect.any(String)],
    updated: [sheet.id],
    closed: [units.id],
    previous: expect.arrayContaining([
      { id: sheet.id, body: sheetBefore.body, severity: "ERROR", lastCheckRunId: first },
      { id: units.id, body: units.body, severity: "ERROR", lastCheckRunId: first },
    ]),
  });

  // The same result again is refused, so nothing doubles.
  expect((await callback(second, doneResult(second, [finding("T-SHEET", "ERROR")]))).status).toBe(409);
});

test("a rule switched off in Settings leaves its open remark alone and isn't sent", async () => {
  const { drawing, rev } = await setup();
  const first = await uploaded(rev.id);
  await callback(first, doneResult(first, [finding("T-SHEET", "ERROR"), finding("D15-UNITS", "ERROR")]));

  await db.insert(drawingCheckConfig).values({ version: 2, rules: { disabled: ["D15-UNITS"] } });
  const second = await uploaded(rev.id);
  expect(sentBody().body.rules.enabled).not.toContain("D15-UNITS");
  expect(await runOf(second)).toMatchObject({ configVersion: 2 });

  // The checker would still report it — the app ignores findings of rules that were off.
  await callback(second, doneResult(second, [finding("D15-UNITS", "ERROR", "again")]));
  const open = await openRemarks(drawing.id);
  expect(open.map(r => [r.checkRuleId, r.lastCheckRunId])).toEqual([["D15-UNITS", first]]);
});

test("without a title block nothing closes: the file can't be told apart from another drawing's", async () => {
  const { drawing, rev } = await setup();
  const first = await uploaded(rev.id);
  await callback(first, doneResult(first, [finding("T-REV", "ERROR"), finding("D15-UNITS", "ERROR")]));

  const second = await uploaded(rev.id);
  await callback(second, doneResult(second, [finding("T-MISSING", "ERROR")], { titleblock: null }));
  expect((await openRemarks(drawing.id)).map(r => r.checkRuleId)).toEqual(["D15-UNITS", "T-MISSING", "T-REV"]);
  expect(await runOf(second)).toMatchObject({ status: "done", sheetCheck: "unreadable" });
});

test("without a sheet code in a project named by the standard, nothing closes: the file could be another drawing's", async () => {
  const { drawing, rev } = await setup();
  // A name off the standard links no sheet code, so there is nothing to compare the title block with.
  const loose = "fire alarm level 1.dxf";
  const first = await uploaded(rev.id, DXF, loose);
  await callback(first, doneResult(first, [finding("T-REV", "ERROR"), finding("D15-UNITS", "ERROR")], { parsedName: null }));
  expect(await runOf(first)).toMatchObject({ status: "done", sheetCheck: "unlinked" });

  const second = await uploaded(rev.id, DXF, loose);
  await callback(second, doneResult(second, [finding("T-MISSING", "ERROR")], { parsedName: null, titleblock: null }));
  // D15-UNITS isn't reported any more, but stays open; new findings are still written.
  expect((await openRemarks(drawing.id)).map(r => r.checkRuleId)).toEqual(["D15-UNITS", "T-MISSING", "T-REV"]);
  expect(await runOf(second)).toMatchObject({ status: "done", sheetCheck: "unlinked" });
  const events = await db.select({ body: drawingEvents.body }).from(drawingEvents)
    .where(and(eq(drawingEvents.drawingId, drawing.id), eq(drawingEvents.kind, "check")));
  expect(events).toHaveLength(2);
  for (const e of events) expect(e.body).toContain("no sheet code, so no remark was closed");
});

test("with the client's file naming, a drawing without a sheet code closes fixed remarks as usual", async () => {
  const { project, drawing, rev } = await setup();
  await db.update(projects).set({ checkClientNaming: true }).where(eq(projects.id, project.id));
  const loose = "CLIENT-FA-L1.dxf";
  const first = await uploaded(rev.id, DXF, loose);
  await callback(first, doneResult(first, [finding("T-REV", "ERROR"), finding("D15-UNITS", "ERROR")], { parsedName: null }));

  const second = await uploaded(rev.id, DXF, loose);
  await callback(second, doneResult(second, [finding("T-MISSING", "ERROR")], { parsedName: null, titleblock: null }));
  // Title-block rules can't be checked without a title block, so T-REV stays; D15-UNITS is fixed and closes.
  expect((await openRemarks(drawing.id)).map(r => r.checkRuleId)).toEqual(["T-MISSING", "T-REV"]);
  expect(await runOf(second)).toMatchObject({ status: "done", sheetCheck: "unset" });
});

test("a failed check changes no remark and says why", async () => {
  const { drawing, rev } = await setup();
  const first = await uploaded(rev.id);
  await callback(first, doneResult(first, [finding("T-SHEET", "ERROR")]));

  const second = await uploaded(rev.id);
  const res = await callback(second, {
    runId: second,
    status: "failed",
    errorCode: "X-READ",
    error: "ფაილი ვერ წავიკითხე.",
    engineVersion: "1.0.0",
    findings: [],
  });
  expect(res.status).toBe(200);
  expect(await runOf(second)).toMatchObject({ status: "failed", errorCode: "X-READ", error: "ფაილი ვერ წავიკითხე." });
  expect((await openRemarks(drawing.id)).map(r => [r.checkRuleId, r.lastCheckRunId])).toEqual([["T-SHEET", first]]);
  expect(store.size).toBe(0);
  const events = await db.select({ body: drawingEvents.body }).from(drawingEvents).where(eq(drawingEvents.kind, "check")).orderBy(drawingEvents.createdAt);
  expect(events.at(-1)?.body).toBe(`Check of ${NAME} failed — ფაილი ვერ წავიკითხე.`);
});

test("unknown, repeated and unreadable results are refused; an unreadable one fails the run", async () => {
  const { rev } = await setup();
  expect((await callback("nope", doneResult("nope", []))).status).toBe(404);

  const runId = await uploaded(rev.id);
  expect((await callback(runId, "{not json")).status).toBe(400);
  expect(await runOf(runId)).toMatchObject({ status: "failed", errorCode: "BAD_RESULT" });

  const next = await uploaded(rev.id);
  expect((await callback(next, doneResult("someone-else", []))).status).toBe(400);
  const third = await uploaded(rev.id);
  expect((await callback(third, doneResult(third, [finding("T-SHEET", "LOUD" as "ERROR")]))).status).toBe(400);
  expect(await db.select().from(drawingRemarks)).toEqual([]);
});

test("text from the DXF can't break the database", async () => {
  const { drawing, rev } = await setup();
  const runId = await uploaded(rev.id);
  const res = await callback(runId, doneResult(runId, [finding("D07-SKU", "ERROR", "SKU\u0000 DS-2CD")], { stats: { "lay\u0000er": "x\u0000" } }));
  expect(res.status).toBe(200);
  const [remark] = await openRemarks(drawing.id);
  expect(remark.body).toContain("• SKU DS-2CD");
});

// ── Remarks by hand ─────────────────────────────────────────────────────────

test("nobody can add an automatic remark by hand", async () => {
  const { rev } = await setup();
  await expect(addDrawingRemark({ revisionId: rev.id, source: "check" as "client", body: "fake" })).rejects.toThrow();
});

test("a hand-resolved automatic remark comes back as a new one if the problem stays", async () => {
  const { drawing, rev } = await setup();
  const first = await uploaded(rev.id);
  await callback(first, doneResult(first, [finding("T-SHEET", "ERROR")]));
  const [old] = await openRemarks(drawing.id);
  expect(await resolveDrawingRemark({ id: old.id, resolution: "Looks fine to me" })).toEqual({ ok: true });

  const second = await uploaded(rev.id);
  await callback(second, doneResult(second, [finding("T-SHEET", "ERROR")]));
  const open = await openRemarks(drawing.id);
  expect(open).toHaveLength(1);
  expect(open[0].id).not.toBe(old.id);

  // One open remark per rule: the old one can't be reopened next to it.
  expect(await reopenDrawingRemark({ id: old.id })).toEqual({
    ok: false,
    error: "The automatic check has already reopened this rule in a newer remark.",
  });
  // Manual remarks work as before.
  expect(await addDrawingRemark({ revisionId: rev.id, source: "client", body: "Move the panel" })).toEqual({ ok: true });
});
