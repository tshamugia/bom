import { afterAll, beforeEach, expect, test, vi } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { NextRequest } from "next/server";
import { resetDb } from "@/../tests/test-helpers/db";
import { mockSession } from "@/../tests/test-helpers/auth";
import { db } from "@/db/client";
import {
  SYSTEM_SETTINGS_ID, auditLog, drawingCheckConfig, drawingCheckRuns, drawingCheckWaivers, drawingRemarks,
  drawingRevisions, drawings, projects, systemSettings,
} from "@/db/schema";
import { CHECK_RULE_IDS } from "@/lib/drawing-check-rules";
import { CLIENT_NAMING_RULES } from "@/lib/drawing-checks";

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
  markCheckRemarkFalse, removeDrawingCheckWaiver, saveDrawingCheckParams, saveDrawingCheckRules, setProjectClientNaming,
} from "@/server/actions/drawing-check-settings";
import { confirmDrawingCheckUpload, requestDrawingCheckUpload } from "@/server/actions/drawing-checks";
import { reopenDrawingRemark, resolveDrawingRemark } from "@/server/actions/drawing-remarks";
import { getDrawingCheckPanel, getDrawingCheckSettingsPage } from "@/server/queries/drawing-checks";
import { POST as resultRoute } from "@/app/api/internal/drawing-checks/[id]/result/route";
import { GET as exportRoute } from "@/app/api/drawing-checks/rules.yaml/route";

const SECRET = checker.env.DXF_CHECKER_SECRET!;
const DXF = new TextEncoder().encode("  0\nSECTION\n  2\nHEADER\n  0\nENDSEC\n  0\nEOF\n");
const NAME = "INS-26TGT-ZZ-00-FA-102.dxf";
const ADMIN_ONLY = { ok: false, error: "Only an admin can do this." };
const STALE = { ok: false, error: expect.stringContaining("Someone else changed the DXF check settings") };

const accepted = () => new Response(JSON.stringify({ accepted: true }), { status: 202 });

beforeEach(async () => {
  await resetDb();
  store.clear();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => accepted());
  checker.env.DXF_CHECKER_URL = "http://dxf-checker.test:8080";
});

/** A drawing owned by a member, checks on, the admin signed in. */
async function setup() {
  const { user: owner } = await mockSession("member");
  const [project] = await db.insert(projects).values({ code: "26TGT", name: "Tegeta" }).returning();
  const [drawing] = await db.insert(drawings).values({ projectId: project.id, code: "FA-102", name: "Fire alarm", ownerId: owner.id }).returning();
  const [rev] = await db.insert(drawingRevisions).values({ drawingId: drawing.id, number: 1, commitMessage: "Initial", status: "in-progress" }).returning();
  await db.insert(systemSettings).values({ id: SYSTEM_SETTINGS_ID, drawingCheckEnabled: true });
  const { user: admin } = await mockSession("admin");
  return { owner, admin, project, drawing, rev };
}

async function upload(revisionId: string) {
  const req = await requestDrawingCheckUpload({ revisionId, fileName: NAME, size: DXF.length });
  if (!req.ok) throw new Error(req.error);
  store.set(req.fields.key, DXF);
  const done = await confirmDrawingCheckUpload({ runId: req.runId });
  if (!done.ok) throw new Error(done.error);
  return req.runId;
}

/** The last request the checker got. */
function sent() {
  const [url, init] = fetchMock.mock.calls.at(-1)!;
  return { url: String(url), body: JSON.parse(String((init as RequestInit).body)) };
}

const finding = (rule: string, severity: "ERROR" | "WARNING" | "INFO" = "ERROR") => ({
  rule, group: null, severity, ref: "NAMING §3", title: `${rule} title`, message: `${rule} broken`, recommendation: "", evidence: "",
});

function callback(runId: string, findings: ReturnType<typeof finding>[]) {
  return resultRoute(
    new NextRequest(`http://bom.test:3000/api/internal/drawing-checks/${runId}/result`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${SECRET}` },
      body: JSON.stringify({
        runId, status: "done", engineVersion: "1.0.0", findings,
        parsedName: { sheetCode: "ZZ-00-FA-102" }, titleblock: { source: "block", values: {} },
      }),
    }),
    { params: Promise.resolve({ id: runId }) },
  );
}

const openRemarks = (drawingId: string) =>
  db.select().from(drawingRemarks).where(and(eq(drawingRemarks.drawingId, drawingId), isNull(drawingRemarks.resolvedAt))).orderBy(drawingRemarks.checkRuleId);

const config = async () => (await db.select().from(drawingCheckConfig))[0];
const audits = (kind: string) => db.select().from(auditLog).where(eq(auditLog.kind, kind as never)).orderBy(auditLog.createdAt);

// ── Who ─────────────────────────────────────────────────────────────────────

test("only admins change the settings, the project exception or a false error; members and viewers are refused", async () => {
  const { project } = await setup();
  for (const role of ["member", "viewer"] as const) {
    await mockSession(role);
    expect(await saveDrawingCheckRules({ baseVersion: 0, disabled: ["D07-SKU"], disabledGroups: [], severity: {} })).toEqual(ADMIN_ONLY);
    expect(await saveDrawingCheckParams({ baseVersion: 0, values: { "drafting.legend_layer": "LEG" } })).toEqual(ADMIN_ONLY);
    expect(await setProjectClientNaming({ projectId: project.id, enabled: true })).toEqual(ADMIN_ONLY);
    expect(await removeDrawingCheckWaiver({ id: "w1" })).toEqual(ADMIN_ONLY);
  }
  expect(await db.select().from(drawingCheckConfig)).toEqual([]);
  expect((await db.select().from(projects))[0].checkClientNaming).toBe(false);

  // The export is the admins' too.
  expect((await exportRoute()).status).toBe(403);
});

// ── Rules ───────────────────────────────────────────────────────────────────

test("saving rules bumps the version, audits what changed and refuses an outdated form", async () => {
  await setup();
  const first = await saveDrawingCheckRules({
    baseVersion: 0,
    disabled: ["D07-SKU"],
    disabledGroups: ["xref"],
    severity: { "D13-CABLE-LAYER-NAME": "INFO", "D15-UNITS": "ERROR" },
  });
  expect(first).toEqual({ ok: true, version: 1 });
  expect(await config()).toMatchObject({
    version: 1,
    // D15-UNITS is ERROR in the catalog already — not stored as an override.
    rules: { disabled: ["D07-SKU"], disabledGroups: ["xref"], severity: { "D13-CABLE-LAYER-NAME": "INFO" } },
  });
  const [log] = await audits("drawing.check.settings.changed");
  expect(log.summary).toBe("DXF check rules v1: group off: Xref; off: D07-SKU; D13-CABLE-LAYER-NAME WARNING → INFO");

  // Nothing changed: no new version.
  expect(await saveDrawingCheckRules({ baseVersion: 1, disabled: ["D07-SKU"], disabledGroups: ["xref"], severity: { "D13-CABLE-LAYER-NAME": "INFO" } }))
    .toEqual({ ok: true, version: 1 });
  // A form opened at v0 can't overwrite v1.
  expect(await saveDrawingCheckRules({ baseVersion: 0, disabled: [], disabledGroups: [], severity: {} })).toEqual(STALE);
  expect(await saveDrawingCheckRules({ baseVersion: 1, disabled: [], disabledGroups: ["xref"], severity: {} })).toEqual({ ok: true, version: 2 });
  expect(await saveDrawingCheckRules({ baseVersion: 2, disabled: ["NOPE"], disabledGroups: [], severity: {} })).toEqual({ ok: false, error: "Unknown rule or group: NOPE." });
  expect((await config()).version).toBe(2);
});

test("a check sends only the rules that run, their severities and the parameters; the run keeps the version", async () => {
  const { rev } = await setup();
  expect((await saveDrawingCheckRules({
    baseVersion: 0,
    disabled: ["D07-SKU"],
    disabledGroups: ["xref"],
    severity: { "D13-CABLE-LAYER-NAME": "INFO", "D05-XREF-ABS": "ERROR" },
  })).ok).toBe(true);
  expect(await saveDrawingCheckParams({ baseVersion: 1, values: { "naming.zones.codes": ["ZZ", "ST", "XX", "K0"], "drafting.insunits_required": 6 } }))
    .toEqual({ ok: true, version: 2 });

  const runId = await upload(rev.id);
  const { rules } = sent().body;
  expect(rules.enabled).toHaveLength(CHECK_RULE_IDS.length - 3);
  expect(rules.enabled).not.toContain("D07-SKU");
  expect(rules.enabled).not.toContain("D05-XREF-ABS");
  // The xref rule's severity isn't sent — the rule doesn't run.
  expect(rules.severity).toEqual({ "D13-CABLE-LAYER-NAME": "INFO" });
  expect(rules.params).toEqual({ naming: { zones: { codes: ["ZZ", "ST", "XX", "K0"] } }, drafting: { insunits_required: 6 } });
  const [run] = await db.select().from(drawingCheckRuns).where(eq(drawingCheckRuns.id, runId));
  expect(run.configVersion).toBe(2);
  expect(run.configSnapshot).toMatchObject({ version: 2, clientNaming: false, waived: [], params: rules.params });
});

// ── Parameters ──────────────────────────────────────────────────────────────

test("a parameter that isn't valid is never stored; every field says what is wrong", async () => {
  await setup();
  const res = await saveDrawingCheckParams({
    baseVersion: 0,
    values: {
      "drafting.sku_generic_pattern": "(",
      "naming.zones.codes": ["ZZ", "zone"],
      "drafting.insunits_required": 99,
      "drafting.legend_layer": "LEGEND-2",
    },
  });
  expect(res).toEqual({
    ok: false,
    error: "Some values aren't valid — nothing was saved.",
    fieldErrors: {
      "drafting.sku_generic_pattern": ["“(” isn't a valid pattern: Unterminated group."],
      "naming.zones.codes": ["“zone” isn't two capital letters or digits."],
      "drafting.insunits_required": ["The largest value is 24."],
    },
  });
  expect(await db.select().from(drawingCheckConfig)).toEqual([]);

  // A pattern JavaScript would take but Python refuses.
  expect(await saveDrawingCheckParams({ baseVersion: 0, values: { "naming.date_patterns": ["(?<=a+)b"] } })).toMatchObject({
    ok: false,
    fieldErrors: { "naming.date_patterns": ["“(?<=a+)b” isn't a valid pattern: look-behind requires fixed-width pattern."] },
  });
  // A required title-block field without tags.
  const fields = { ...(await import("@/lib/drawing-check-params")).DEFAULT_RULES_YAML.titleblock.fields, scale: [] };
  expect(await saveDrawingCheckParams({ baseVersion: 0, values: { "titleblock.fields": fields } })).toMatchObject({
    ok: false,
    fieldErrors: { "titleblock.fields": ["Required fields need at least one tag: scale."] },
  });
  expect(await saveDrawingCheckParams({ baseVersion: 0, values: { "naming.nope": "x" } })).toEqual({ ok: false, error: "Unknown parameter: naming.nope." });
  expect(await db.select().from(drawingCheckConfig)).toEqual([]);
});

test("the checker has the last word on patterns; when it can't answer, the app's own check stands", async () => {
  await setup();
  fetchMock.mockImplementationOnce(async () =>
    new Response(JSON.stringify({ detail: "პარამეტრი „naming.forbidden_tokens“: არასწორი regex „x“ (bad)." }), { status: 422 }));
  expect(await saveDrawingCheckParams({ baseVersion: 0, values: { "naming.forbidden_tokens": ["x"] } })).toEqual({
    ok: false,
    error: "Some values aren't valid — nothing was saved.",
    fieldErrors: { "naming.forbidden_tokens": ["The checker refused it: პარამეტრი „naming.forbidden_tokens“: არასწორი regex „x“ (bad)."] },
  });
  expect(sent().url).toBe("http://dxf-checker.test:8080/v1/params/validate");
  expect(sent().body).toEqual({ params: { naming: { forbidden_tokens: ["x"] } } });
  expect(await db.select().from(drawingCheckConfig)).toEqual([]);

  fetchMock.mockImplementationOnce(async () => { throw new TypeError("fetch failed"); });
  expect(await saveDrawingCheckParams({ baseVersion: 0, values: { "naming.forbidden_tokens": ["x"] } })).toEqual({ ok: true, version: 1 });
});

test("parameters store only what differs from the standard; each save is a version and an audit row", async () => {
  await setup();
  checker.env.DXF_CHECKER_URL = undefined;
  expect(await saveDrawingCheckParams({
    baseVersion: 0,
    values: { "naming.systems": { FA: "Fire alarm", CC: "CCTV" }, "drafting.legend_layer": "LEGEND" },
  })).toEqual({ ok: true, version: 1 });
  expect((await config()).params).toEqual({ naming: { systems: { FA: "Fire alarm", CC: "CCTV" } } });
  const [log] = await audits("drawing.check.settings.changed");
  expect(log.summary).toBe("DXF check parameters v1: System codes");
  expect(log.payload).toMatchObject({ version: 1, changed: ["naming.systems"], after: { "naming.systems": { FA: "Fire alarm", CC: "CCTV" } } });

  // Rules and parameters share the version.
  expect(await saveDrawingCheckRules({ baseVersion: 1, disabled: ["D06-DUPLICATE"], disabledGroups: [], severity: {} })).toEqual({ ok: true, version: 2 });
  expect(await saveDrawingCheckParams({ baseVersion: 1, values: { "drafting.legend_layer": "LEG" } })).toEqual(STALE);
  // Back to the standard's value: the override goes.
  const { DEFAULT_RULES_YAML } = await import("@/lib/drawing-check-params");
  expect(await saveDrawingCheckParams({ baseVersion: 2, values: { "naming.systems": DEFAULT_RULES_YAML.naming.systems } })).toEqual({ ok: true, version: 3 });
  expect(await config()).toMatchObject({ version: 3, params: {}, rules: { disabled: ["D06-DUPLICATE"] } });

  const page = await getDrawingCheckSettingsPage();
  expect(page.config).toMatchObject({ version: 3, updatedByName: expect.any(String) });
});

test("the export is rules.yaml with Settings' values", async () => {
  await setup();
  checker.env.DXF_CHECKER_URL = undefined;
  await saveDrawingCheckParams({ baseVersion: 0, values: { "drafting.legend_layer": "LEGEND-2" } });
  await saveDrawingCheckRules({ baseVersion: 1, disabled: ["D07-SKU"], disabledGroups: [], severity: { "D15-SCALE": "INFO" } });
  const res = await exportRoute();
  expect(res.status).toBe(200);
  expect(res.headers.get("content-disposition")).toBe('attachment; filename="rules.yaml"');
  const yaml = await res.text();
  expect(yaml).toContain("version 2");
  expect(yaml).toContain("  legend_layer: LEGEND-2\n");
  expect(yaml).toContain("severity_overrides:\n  D15-SCALE: INFO\n");
  expect(yaml).toContain("#   D07-SKU");
});

// ── Project exception ───────────────────────────────────────────────────────

test("a project with the client's naming checks no file-name rule and leaves those remarks alone", async () => {
  const { project, drawing, rev } = await setup();
  const first = await upload(rev.id);
  await callback(first, [finding("N-FORMAT"), finding("D15-UNITS")]);
  expect((await openRemarks(drawing.id)).map(r => r.checkRuleId)).toEqual(["D15-UNITS", "N-FORMAT"]);

  expect(await setProjectClientNaming({ projectId: project.id, enabled: true })).toEqual({ ok: true });
  const [log] = await audits("drawing.check.settings.changed");
  expect(log).toMatchObject({ refType: "project", refId: project.id, summary: "26TGT: client file naming — DXF checks skip the file-name rules" });

  const second = await upload(rev.id);
  const { rules } = sent().body;
  expect(rules.enabled.filter((r: string) => CLIENT_NAMING_RULES.has(r))).toEqual([]);
  expect(rules.enabled).toContain("T-SHEET");
  // A clean result: D15-UNITS closes, N-FORMAT wasn't checked and stays.
  await callback(second, []);
  expect((await openRemarks(drawing.id)).map(r => r.checkRuleId)).toEqual(["N-FORMAT"]);
  expect((await getDrawingCheckPanel(drawing.id)).clientNaming).toBe(true);
});

test("the exception applies to a result that arrives after it was set", async () => {
  const { project, drawing, rev } = await setup();
  const runId = await upload(rev.id);
  await setProjectClientNaming({ projectId: project.id, enabled: true });
  await callback(runId, [finding("N-SYSTEM"), finding("D06-DUPLICATE")]);
  expect((await openRemarks(drawing.id)).map(r => r.checkRuleId)).toEqual(["D06-DUPLICATE"]);
});

// ── False errors ────────────────────────────────────────────────────────────

test("a false error closes the remark, stops the rule on that drawing and shows on the card; an admin takes it back", async () => {
  const { owner, drawing, rev } = await setup();
  const first = await upload(rev.id);
  await callback(first, [finding("D07-SKU", "WARNING"), finding("D15-UNITS")]);
  const sku = (await openRemarks(drawing.id)).find(r => r.checkRuleId === "D07-SKU")!;

  // Any editor can, with a reason.
  await mockSession("member");
  expect(await markCheckRemarkFalse({ id: sku.id, reason: "  " })).toEqual({ ok: false, error: "Say why the check is wrong here." });
  expect(await markCheckRemarkFalse({ id: sku.id, reason: "FP200 is a cable type" })).toEqual({ ok: true });
  const [closed] = await db.select().from(drawingRemarks).where(eq(drawingRemarks.id, sku.id));
  expect(closed.resolution).toBe("False error — FP200 is a cable type");
  expect(closed.resolvedAt).toBeInstanceOf(Date);
  const [waiver] = await db.select().from(drawingCheckWaivers);
  expect(waiver).toMatchObject({ drawingId: drawing.id, ruleId: "D07-SKU", reason: "FP200 is a cable type", remarkId: sku.id });
  const [log] = await audits("drawing.check.waived");
  expect(log.summary).toBe("FA-102: D07-SKU marked as a false error — no longer checked on this drawing");

  const panel = await getDrawingCheckPanel(drawing.id);
  expect(panel.waivers.map(w => [w.ruleId, w.reason, w.drawingCode])).toEqual([["D07-SKU", "FP200 is a cable type", "FA-102"]]);

  // The next check doesn't run it, and a late finding doesn't raise it.
  await mockSession("admin");
  const second = await upload(rev.id);
  expect(sent().body.rules.enabled).not.toContain("D07-SKU");
  const [run] = await db.select().from(drawingCheckRuns).where(eq(drawingCheckRuns.id, second));
  expect(run.configSnapshot?.waived).toEqual(["D07-SKU"]);
  await callback(second, [finding("D07-SKU"), finding("D15-UNITS")]);
  expect((await openRemarks(drawing.id)).map(r => r.checkRuleId)).toEqual(["D15-UNITS"]);

  // Members can't take it back; an admin can, and the rule runs again.
  await mockSession("member");
  expect(await removeDrawingCheckWaiver({ id: waiver.id })).toEqual(ADMIN_ONLY);
  await mockSession("admin");
  expect(await removeDrawingCheckWaiver({ id: waiver.id })).toEqual({ ok: true });
  expect(await removeDrawingCheckWaiver({ id: waiver.id })).toEqual({ ok: false, error: "This false error was already removed." });
  const [removed] = await audits("drawing.check.waiver.removed");
  expect(removed.summary).toBe("FA-102: D07-SKU is checked again — false error removed");
  const third = await upload(rev.id);
  expect(sent().body.rules.enabled).toContain("D07-SKU");
  await callback(third, [finding("D07-SKU"), finding("D15-UNITS")]);
  expect((await openRemarks(drawing.id)).map(r => r.checkRuleId)).toEqual(["D07-SKU", "D15-UNITS"]);
  expect(owner.id).toBeTruthy();
});

test("a false error marked while a check runs already applies to its result", async () => {
  const { drawing, rev } = await setup();
  const first = await upload(rev.id);
  await callback(first, [finding("D02-COPY-BLOCK", "WARNING")]);
  const [copy] = await openRemarks(drawing.id);

  const second = await upload(rev.id);
  expect(await markCheckRemarkFalse({ id: copy.id, reason: "Block names come from the client" })).toEqual({ ok: true });
  await callback(second, [finding("D02-COPY-BLOCK", "WARNING")]);
  expect(await openRemarks(drawing.id)).toEqual([]);
});

test("only an open automatic remark can be a false error; viewers can't mark one", async () => {
  const { drawing, rev } = await setup();
  const runId = await upload(rev.id);
  await callback(runId, [finding("T-SHEET")]);
  const [remark] = await openRemarks(drawing.id);

  await mockSession("viewer");
  expect(await markCheckRemarkFalse({ id: remark.id, reason: "x" })).toEqual({ ok: false, error: "Viewers have read-only access." });

  await mockSession("member");
  const [manual] = await db.insert(drawingRemarks).values({ drawingId: drawing.id, revisionId: rev.id, source: "client", body: "Move it" }).returning();
  expect(await markCheckRemarkFalse({ id: manual.id, reason: "x" })).toEqual({ ok: false, error: "Only a remark from the automatic check can be a false error." });
  expect(await resolveDrawingRemark({ id: remark.id })).toEqual({ ok: true });
  expect(await markCheckRemarkFalse({ id: remark.id, reason: "x" })).toEqual({ ok: false, error: "This remark is already resolved." });
  expect(await reopenDrawingRemark({ id: remark.id })).toEqual({ ok: true });
  expect(await db.select().from(drawingCheckWaivers)).toEqual([]);
});
