import { describe, expect, test } from "vitest";
import { CHECK_RULE_IDS } from "@/lib/drawing-check-rules";
import {
  CHECK_REMARK_MAX, MAX_DXF_BYTES, PENDING_STALE_MS, QUEUED_STALE_MS, checkConfigSnapshot, checkDxfFile, checkFileRole,
  checkRemarkBody, checkRequestBody, checkUploadBlock, countFindings, describeCounts, describeRemarkChanges,
  isCheckRunStale, parseCheckRulesConfig, planRemarkChanges, sniffDxf, storedDxfError, uncheckedRules,
  type CheckFinding,
} from "@/lib/drawing-checks";
import { DRAWING_STATUSES } from "@/lib/drawing-status";

const bytes = (s: string) => new TextEncoder().encode(s);

const finding = (rule: string, severity: CheckFinding["severity"], message = `${rule} broken`, extra: Partial<CheckFinding> = {}): CheckFinding => ({
  rule, severity, message, title: `${rule} title`, ref: "NAMING §3", recommendation: `Fix ${rule}`, evidence: "", ...extra,
});

describe("what can be uploaded", () => {
  test("only .dxf files with something in them, up to the limit; a DWG is told how to save a DXF", () => {
    expect(checkDxfFile({ name: "INS-26TGT-ZZ-00-FA-102.dxf", size: 10 })).toEqual({ ok: true });
    expect(checkDxfFile({ name: "plan.DXF", size: 10 })).toEqual({ ok: true });
    expect(checkDxfFile({ name: "plan.dwg", size: 10 })).toEqual({ ok: false, error: "DWG" });
    expect(checkDxfFile({ name: "plan.pdf", size: 10 })).toEqual({ ok: false, error: "NOT_DXF" });
    expect(checkDxfFile({ name: "plan.dxf", size: 0 })).toEqual({ ok: false, error: "EMPTY" });
    expect(checkDxfFile({ name: "plan.dxf", size: MAX_DXF_BYTES + 1 })).toEqual({ ok: false, error: "TOO_LARGE" });
  });

  test("the stored bytes decide: ASCII and binary DXF pass, a renamed DWG and anything else don't", () => {
    expect(sniffDxf(bytes("  0\nSECTION\n  2\nHEADER\n"))).toBe("dxf");
    expect(sniffDxf(bytes("﻿999\ncomment\n  0\nSECTION"))).toBe("dxf");
    expect(sniffDxf(bytes("AutoCAD Binary DXF\r\n\x1a\x00"))).toBe("dxf-binary");
    expect(sniffDxf(bytes("AC1032\x00\x00\x00"))).toBe("dwg");
    expect(sniffDxf(bytes("%PDF-1.7"))).toBe("unknown");

    expect(storedDxfError(bytes("  0\nSECTION"))).toBeNull();
    expect(storedDxfError(bytes("AC1027"))).toMatch(/DWG renamed to \.dxf.*SAVEAS → AutoCAD 2018 DXF/);
    expect(storedDxfError(bytes("<html>"))).toMatch(/isn't a DXF/);
  });

  test("the switch, the setup, the latest revision and a running check block uploads, in that order", () => {
    const ok = { enabled: true, configured: true, isLatest: true, running: false };
    expect(checkUploadBlock(ok)).toBeNull();
    expect(checkUploadBlock({ ...ok, enabled: false, configured: false })).toBe("DISABLED");
    expect(checkUploadBlock({ ...ok, configured: false })).toBe("NOT_CONFIGURED");
    expect(checkUploadBlock({ ...ok, isLatest: false, running: true })).toBe("NOT_LATEST");
    expect(checkUploadBlock({ ...ok, running: true })).toBe("RUNNING");
  });

  test("the drawing status stands in for the file's folder", () => {
    const roles = Object.fromEntries(DRAWING_STATUSES.map(s => [s, checkFileRole(s)]));
    expect(roles).toEqual({
      "in-progress": "wip",
      "paused": "wip",
      "need-approval": "wip",
      "awaiting-approval": "issued",
      "approved-a": "issued",
      "approved-b": "issued",
      "as-built": "issued",
    });
  });
});

describe("runs", () => {
  test("an upload left pending or a check left queued too long is stale", () => {
    const now = new Date("2026-11-10T12:00:00Z");
    const ago = (ms: number) => new Date(now.getTime() - ms);
    expect(isCheckRunStale({ status: "pending", createdAt: ago(PENDING_STALE_MS - 1000), startedAt: null }, now)).toBe(false);
    expect(isCheckRunStale({ status: "pending", createdAt: ago(PENDING_STALE_MS + 1000), startedAt: null }, now)).toBe(true);
    // Queued counts from when the checker accepted the file.
    expect(isCheckRunStale({ status: "queued", createdAt: ago(QUEUED_STALE_MS * 2), startedAt: ago(1000) }, now)).toBe(false);
    expect(isCheckRunStale({ status: "queued", createdAt: ago(QUEUED_STALE_MS * 2), startedAt: ago(QUEUED_STALE_MS + 1000) }, now)).toBe(true);
    expect(isCheckRunStale({ status: "done", createdAt: ago(QUEUED_STALE_MS * 9), startedAt: null }, now)).toBe(false);
  });

  test("every check carries the enabled rules, severities and parameters it ran with", () => {
    const cfg = parseCheckRulesConfig({ disabled: ["D07-SKU", 42], severity: { "D13-CABLE-LAYER-NAME": "ERROR", "NOPE": "ERROR", "D15-UNITS": "LOUD" } });
    expect(cfg).toEqual({ disabled: ["D07-SKU"], severity: { "D13-CABLE-LAYER-NAME": "ERROR" } });
    expect(parseCheckRulesConfig(null)).toEqual({ disabled: [], severity: {} });

    const snap = checkConfigSnapshot({ version: 3, rules: cfg, params: { drafting: { insunits_required: 4 } } });
    expect(snap.version).toBe(3);
    expect(snap.enabled).toHaveLength(CHECK_RULE_IDS.length - 1);
    expect(snap.enabled).not.toContain("D07-SKU");

    expect(checkRequestBody({
      runId: "run1",
      fileUrl: "https://bucket.example/checks/run1.dxf?sig",
      fileName: "INS-26TGT-ZZ-00-FA-102.dxf",
      sizeBytes: 1234,
      role: "wip",
      config: snap,
      callbackUrl: "http://bom.railway.internal:3000/api/internal/drawing-checks/run1/result",
    })).toEqual({
      runId: "run1",
      file: { url: "https://bucket.example/checks/run1.dxf?sig", name: "INS-26TGT-ZZ-00-FA-102.dxf", sizeBytes: 1234 },
      context: { role: "wip" },
      rules: { enabled: snap.enabled, severity: { "D13-CABLE-LAYER-NAME": "ERROR" }, params: { drafting: { insunits_required: 4 } } },
      callbackUrl: "http://bom.railway.internal:3000/api/internal/drawing-checks/run1/result",
    });
  });
});

describe("findings → Remarks", () => {
  const all = CHECK_RULE_IDS;

  test("each broken rule is one Remark; INFO only shows in the report", () => {
    const plan = planRemarkChanges({
      findings: [
        finding("D02-COPY-BLOCK", "WARNING", "copy 1"),
        finding("D02-COPY-BLOCK", "WARNING", "copy 2"),
        finding("T-SHEET", "ERROR"),
        finding("D11-LEGEND-UNITS", "INFO"),
      ],
      enabled: all,
      open: [],
    });
    expect(plan.create.map(c => [c.ruleId, c.severity])).toEqual([["D02-COPY-BLOCK", "WARNING"], ["T-SHEET", "ERROR"]]);
    expect(plan.create[0].body).toContain("• copy 1\n• copy 2");
    expect(plan.update).toEqual([]);
    expect(plan.close).toEqual([]);
  });

  test("a rule with an ERROR and a WARNING is an ERROR remark, errors listed first", () => {
    const plan = planRemarkChanges({
      findings: [finding("D07-SKU", "WARNING", "maybe a SKU"), finding("D07-SKU", "ERROR", "surely a SKU")],
      enabled: all,
      open: [],
    });
    expect(plan.create).toHaveLength(1);
    expect(plan.create[0].severity).toBe("ERROR");
    expect(plan.create[0].body.indexOf("surely")).toBeLessThan(plan.create[0].body.indexOf("maybe"));
  });

  test("checking again follows the issue's table: update, create, close, leave alone", () => {
    const open = [
      { id: "r-still", ruleId: "T-SHEET", body: "old", severity: "ERROR" as const },
      { id: "r-fixed", ruleId: "D15-UNITS", body: "old", severity: "ERROR" as const },
      { id: "r-off", ruleId: "D07-SKU", body: "old", severity: "WARNING" as const },
      { id: "r-info", ruleId: "D11-LEGEND-UNITS", body: "old", severity: "WARNING" as const },
    ];
    const plan = planRemarkChanges({
      findings: [
        finding("T-SHEET", "ERROR", "still wrong"),
        finding("N-FORMAT", "ERROR"),
        // The rule is off in this run: whatever the checker says, it changes nothing.
        finding("D07-SKU", "ERROR"),
        finding("D11-LEGEND-UNITS", "INFO"),
      ],
      enabled: all.filter(r => r !== "D07-SKU"),
      open,
    });
    expect(plan.update).toEqual([expect.objectContaining({ id: "r-still", ruleId: "T-SHEET", severity: "ERROR" })]);
    expect(plan.update[0].body).toContain("still wrong");
    expect(plan.create.map(c => c.ruleId)).toEqual(["N-FORMAT"]);
    // INFO-only counts as passed for Remarks.
    expect(plan.close).toEqual([{ id: "r-fixed", ruleId: "D15-UNITS" }, { id: "r-info", ruleId: "D11-LEGEND-UNITS" }]);
    expect(plan.untouched).toEqual([{ id: "r-off", ruleId: "D07-SKU" }]);
  });

  test("rules the file couldn't be checked against keep their remarks open", () => {
    const unchecked = uncheckedRules({ nameParsed: false, titleBlockFound: false });
    expect(unchecked.has("N-ZONE")).toBe(true);
    expect(unchecked.has("N-REV-WIP")).toBe(true);
    expect(unchecked.has("T-SHEET")).toBe(true);
    expect(unchecked.has("T-FIELD-MISSING")).toBe(true);
    expect(unchecked.has("T-MISSING")).toBe(false);
    expect(unchecked.has("N-FORMAT")).toBe(false);
    expect(unchecked.has("D15-UNITS")).toBe(false);
    expect(uncheckedRules({ nameParsed: true, titleBlockFound: true }).size).toBe(0);

    const plan = planRemarkChanges({
      findings: [finding("T-MISSING", "ERROR")],
      enabled: all,
      open: [
        { id: "a", ruleId: "T-REV", body: "", severity: "ERROR" },
        { id: "b", ruleId: "D15-UNITS", body: "", severity: "ERROR" },
      ],
      unchecked: uncheckedRules({ nameParsed: true, titleBlockFound: false }),
    });
    expect(plan.untouched).toEqual([{ id: "a", ruleId: "T-REV" }]);
    expect(plan.close).toEqual([{ id: "b", ruleId: "D15-UNITS" }]);
    expect(plan.create.map(c => c.ruleId)).toEqual(["T-MISSING"]);
  });

  test("a clean file closes every open automatic remark of an enabled rule", () => {
    const plan = planRemarkChanges({
      findings: [],
      enabled: all,
      open: [{ id: "a", ruleId: "N-LOWER", body: "", severity: "ERROR" }],
    });
    expect(plan).toEqual({ create: [], update: [], close: [{ id: "a", ruleId: "N-LOWER" }], untouched: [] });
  });
});

describe("Remark text", () => {
  test("title, standard reference, what was found and how to fix it", () => {
    const body = checkRemarkBody("T-SHEET", [
      finding("T-SHEET", "ERROR", "შტამპში FA-104, სახელში FA-102.", { evidence: "FA-104", recommendation: "ერთი უნდა იყოს." }),
      finding("T-SHEET", "ERROR", "მეორე ადგილი.", { recommendation: "ერთი უნდა იყოს." }),
    ]);
    expect(body).toBe(
      "T-SHEET title (NAMING §3)\n\n• შტამპში FA-104, სახელში FA-102.\n  FA-104\n• მეორე ადგილი.\n\n→ ერთი უნდა იყოს.",
    );
  });

  test("falls back to the catalog's title and reference", () => {
    const body = checkRemarkBody("D15-UNITS", [{ rule: "D15-UNITS", severity: "ERROR", message: "INSUNITS=6" }]);
    expect(body.split("\n")[0]).toBe("ერთეული მილიმეტრი არ არის (INSUNITS≠4) (DRAFTING წესი 15)");
  });

  test("a long list is cut with “+N სხვა” and the advice is kept, within 4000 characters", () => {
    const many = Array.from({ length: 300 }, (_, i) => finding("D02-COPY-BLOCK", "WARNING", `ბლოკი BLOCK-${i} ჩაკოპირებულია ფაილში და უნდა შეიცვალოს ბიბლიოთეკის ბლოკით`));
    const body = checkRemarkBody("D02-COPY-BLOCK", many);
    expect(body.length).toBeLessThanOrEqual(CHECK_REMARK_MAX);
    const hidden = Number(body.match(/\+(\d+) სხვა/)?.[1]);
    const shown = body.split("\n").filter(l => l.startsWith("• ")).length;
    expect(shown + hidden).toBe(300);
    expect(body.endsWith("→ Fix D02-COPY-BLOCK")).toBe(true);
  });

  test("one finding longer than the whole remark is shortened, not dropped", () => {
    const body = checkRemarkBody("D07-SKU", [finding("D07-SKU", "ERROR", "x".repeat(9000))]);
    expect(body.length).toBeLessThanOrEqual(CHECK_REMARK_MAX);
    expect(body).toContain("• xxx");
    expect(body).toContain("…");
  });
});

test("summaries for the card, the timeline and the audit log", () => {
  const counts = countFindings([finding("A", "ERROR"), finding("B", "ERROR"), finding("C", "WARNING"), finding("D", "INFO")]);
  expect(counts).toEqual({ ERROR: 2, WARNING: 1, INFO: 1 });
  expect(describeCounts(counts)).toBe("2 errors, 1 to check, 1 info");
  expect(describeCounts({ ERROR: 1, WARNING: 0, INFO: 0 })).toBe("1 error");
  expect(describeCounts({ ERROR: 0, WARNING: 0, INFO: 0 })).toBe("No findings");
  expect(describeRemarkChanges({ created: 2, updated: 1, closed: 3 })).toBe("Remarks: 2 new, 1 still open, 3 closed");
  expect(describeRemarkChanges({ created: 0, updated: 0, closed: 0 })).toBeNull();
});
