import { describe, expect, test } from "vitest";
import {
  canDecideCheckRun, checkFileLink, checkTitleBlockSheet, describeUndo, isSheetCode, normalizeSheetCode, oldProjectCodeReason,
  parseDrawingFileName, planBulkCheck, sheetCheckCloses, sheetCheckNote, sheetCodeLocked, sheetNumberOf, type BulkCheckDrawing,
} from "@/lib/drawing-check-link";
import { MAX_BULK_DRAWINGS } from "@/lib/drawing-bulk";
import { DXF_FILE_ERROR_MESSAGE } from "@/lib/drawing-checks";

describe("sheet codes", () => {
  test("zone, floor, system and number", () => {
    expect(isSheetCode("ZZ-00-FA-102")).toBe(true);
    expect(isSheetCode("B1-M1-CC-001")).toBe(true);
    expect(isSheetCode("ZZ-00-F1-102")).toBe(false);
    expect(isSheetCode("FA-102")).toBe(false);
    expect(normalizeSheetCode(" zz-00-fa-102 ")).toBe("ZZ-00-FA-102");
    expect(sheetNumberOf("ZZ-00-FA-102")).toBe("FA-102");
  });
});

describe("parseDrawingFileName", () => {
  test("reads a standard name like the checker does", () => {
    expect(parseDrawingFileName("INS-26TGT-ZZ-00-FA-102_P01.dxf")).toEqual({
      originator: "INS", project: "26TGT", zone: "ZZ", floor: "00", system: "FA", number: "102",
      revision: "P01", sheet: "FA-102", sheetCode: "ZZ-00-FA-102",
    });
    expect(parseDrawingFileName("C:\\work\\INS-26TGT-ZZ-00-FA-102.dxf")?.revision).toBeNull();
  });

  test("anything else doesn't parse", () => {
    expect(parseDrawingFileName("ins-26tgt-zz-00-fa-102.dxf")).toBeNull();
    expect(parseDrawingFileName("Fire alarm level 1.dxf")).toBeNull();
    expect(parseDrawingFileName("INS-26TGT-ZZ-00-FA-102_P01_final.dxf")).toBeNull();
  });
});

describe("checkFileLink", () => {
  const NAME = "INS-26TGT-ZZ-00-FA-102.dxf";

  test("a drawing without a sheet code takes the file's", () => {
    expect(checkFileLink({ fileName: NAME, projectCode: "26TGT", sheetCode: null })).toMatchObject({ ok: true, link: "ZZ-00-FA-102" });
  });

  test("once set, the file has to carry exactly that sheet code", () => {
    expect(checkFileLink({ fileName: NAME, projectCode: "26TGT", sheetCode: "ZZ-00-FA-102" })).toMatchObject({ ok: true, link: null });
    expect(checkFileLink({ fileName: NAME, projectCode: "26TGT", sheetCode: "ZZ-00-FA-103" })).toMatchObject({ ok: false, error: "OTHER_SHEET" });
  });

  test("another project's file is refused; an old-style project code can't be compared", () => {
    expect(checkFileLink({ fileName: NAME, projectCode: "26ABC", sheetCode: null })).toMatchObject({ ok: false, error: "OTHER_PROJECT" });
    expect(checkFileLink({ fileName: NAME, projectCode: "BS-005", sheetCode: null })).toMatchObject({ ok: true, link: "ZZ-00-FA-102" });
  });

  test("a name off the standard is the uploader's call", () => {
    expect(checkFileLink({ fileName: "plan.dxf", projectCode: "26TGT", sheetCode: "ZZ-00-FA-102" })).toEqual({ ok: true, parsed: null, link: null });
  });
});

describe("planBulkCheck", () => {
  const d = (id: string, patch: Partial<BulkCheckDrawing> = {}): BulkCheckDrawing => ({
    id, code: id.toUpperCase(), projectId: "p1", projectCode: "26TGT", sheetCode: null, ...patch,
  });
  const f = (key: string, name: string, size = 100) => ({ key, name, size });
  const states = (items: { key: string; state: string; drawingId: string | null }[]) =>
    Object.fromEntries(items.map(i => [i.key, [i.state, i.drawingId]]));

  test("a standard name goes to the selected drawing with that sheet code", () => {
    const plan = planBulkCheck({
      drawings: [d("a", { sheetCode: "ZZ-00-FA-101" }), d("b", { sheetCode: "ZZ-00-FA-102" })],
      files: [f("1", "INS-26TGT-ZZ-00-FA-102_P02.dxf"), f("2", "INS-26TGT-ZZ-00-FA-101.dxf")],
    });
    expect(states(plan.items)).toEqual({ 1: ["ready", "b"], 2: ["ready", "a"] });
    expect(plan.items[0]).toMatchObject({ match: "sheet", link: null, sheetCode: "ZZ-00-FA-102" });
  });

  test("an unmatched sheet is picked among the project's drawings without a sheet code, and linked", () => {
    const drawings = [d("a", { sheetCode: "ZZ-00-FA-101" }), d("b"), d("c")];
    const files = [f("1", "INS-26TGT-ZZ-00-FA-103.dxf")];
    const before = planBulkCheck({ drawings, files });
    expect(before.items[0]).toMatchObject({ state: "pick", options: ["b", "c"], drawingId: null });
    const after = planBulkCheck({ drawings, files, picks: { 1: "c" } });
    expect(after.items[0]).toMatchObject({ state: "ready", drawingId: "c", match: "pick", link: "ZZ-00-FA-103" });
    // A pick outside the options doesn't count.
    expect(planBulkCheck({ drawings, files, picks: { 1: "a" } }).items[0].state).toBe("pick");
  });

  test("a name off the standard is always picked by hand, from every usable drawing", () => {
    const plan = planBulkCheck({ drawings: [d("a", { sheetCode: "ZZ-00-FA-101" }), d("b")], files: [f("1", "plan.dxf")], picks: { 1: "a" } });
    expect(plan.items[0]).toMatchObject({ state: "ready", drawingId: "a", match: "pick", link: null, options: ["a", "b"] });
  });

  test("another project's file and a file that isn't a DXF stop", () => {
    const plan = planBulkCheck({
      drawings: [d("a")],
      files: [f("1", "INS-26ABC-ZZ-00-FA-101.dxf"), f("2", "INS-26TGT-ZZ-00-FA-101.dwg"), f("3", "INS-26TGT-ZZ-00-FA-101.dxf", 0)],
    });
    expect(plan.items.map(i => i.state)).toEqual(["stopped", "stopped", "stopped"]);
    expect(plan.items[0].reason).toContain("project 26ABC");
    expect(plan.items[1].reason).toBe(DXF_FILE_ERROR_MESSAGE.DWG);
    expect(plan.items[2].reason).toBe(DXF_FILE_ERROR_MESSAGE.EMPTY);
  });

  test("two files for one drawing stop, both", () => {
    const plan = planBulkCheck({
      drawings: [d("a", { sheetCode: "ZZ-00-FA-101" }), d("b")],
      files: [f("1", "INS-26TGT-ZZ-00-FA-101.dxf"), f("2", "plan.dxf")],
      picks: { 2: "a" },
    });
    expect(plan.items.map(i => i.state)).toEqual(["stopped", "stopped"]);
    expect(plan.items[0].reason).toBe("2 files go to A — remove one, or pick another drawing.");
    // The picked one can still be moved to another drawing.
    expect(plan.items[1].options).toEqual(["a", "b"]);
  });

  test("two files of one sheet stop, even before anyone picked", () => {
    const plan = planBulkCheck({
      drawings: [d("a"), d("b")],
      files: [f("1", "INS-26TGT-ZZ-00-FA-101_P01.dxf"), f("2", "INS-26TGT-ZZ-00-FA-101_P02.dxf")],
    });
    expect(plan.items.map(i => [i.state, i.reason])).toEqual([
      ["stopped", "2 files are sheet ZZ-00-FA-101 — remove the extra ones."],
      ["stopped", "2 files are sheet ZZ-00-FA-101 — remove the extra ones."],
    ]);
  });

  test("drawings of a project with an old-style code are left out", () => {
    const plan = planBulkCheck({
      drawings: [d("a", { projectId: "p2", projectCode: "BS-005" }), d("b")],
      files: [f("1", "plan.dxf")],
    });
    expect(plan.blocked).toEqual([{ id: "a", code: "A", reason: oldProjectCodeReason("BS-005") }]);
    expect(plan.items[0].options).toEqual(["b"]);
  });

  test("the server adds sheet codes of unselected drawings and drawings still being checked", () => {
    const plan = planBulkCheck({
      drawings: [d("a", { sheetCode: "ZZ-00-FA-101" }), d("b")],
      files: [f("1", "INS-26TGT-ZZ-00-FA-101.dxf"), f("2", "INS-26TGT-ZZ-00-FA-109.dxf")],
      takenBy: (_p, sheet) => (sheet === "ZZ-00-FA-109" ? "Z-009" : null),
      drawingBlock: id => (id === "a" ? "still running" : null),
    });
    expect(plan.items.map(i => [i.state, i.reason])).toEqual([
      ["stopped", "A: still running"],
      ["stopped", "ZZ-00-FA-109 is the sheet code of Z-009, which isn't selected."],
    ]);
  });

  test(`no more than ${MAX_BULK_DRAWINGS} files`, () => {
    const files = Array.from({ length: MAX_BULK_DRAWINGS + 1 }, (_, i) => f(String(i), `plan ${i}.dxf`));
    const plan = planBulkCheck({ drawings: [d("a")], files });
    expect(plan.items.at(-1)).toMatchObject({ state: "stopped", reason: `Only ${MAX_BULK_DRAWINGS} files can be checked at once.` });
  });
});

describe("checkTitleBlockSheet", () => {
  const tb = (sheet_no: unknown) => ({ source: "block", values: { sheet_no } });
  const check = (sheetCode: string | null, titleblock: unknown, clientNaming = false) =>
    checkTitleBlockSheet({ sheetCode, titleblock, clientNaming });

  test("the sheet number or the whole sheet code matches", () => {
    expect(check("ZZ-00-FA-102", tb("FA-102")).verdict).toBe("match");
    expect(check("ZZ-00-FA-102", tb(" zz-00-fa-102")).verdict).toBe("match");
  });

  test("another sheet holds the run; a missing one can't be read", () => {
    expect(check("ZZ-00-FA-102", tb("FA-104"))).toEqual({ verdict: "mismatch", found: "FA-104" });
    expect(check("ZZ-00-FA-102", null).verdict).toBe("unreadable");
    expect(check("ZZ-00-FA-102", tb("")).verdict).toBe("unreadable");
    expect(check("ZZ-00-FA-102", { values: {} }).verdict).toBe("unreadable");
    // The client's naming doesn't change anything once the drawing has a sheet code.
    expect(check("ZZ-00-FA-102", tb("FA-104"), true).verdict).toBe("mismatch");
  });

  test("no sheet code: nothing closes in a standard project, as usual with the client's naming", () => {
    expect(check(null, tb("FA-104"))).toEqual({ verdict: "unlinked", found: "FA-104" });
    expect(check(null, null).verdict).toBe("unlinked");
    expect(check(null, tb("FA-104"), true).verdict).toBe("unset");
  });

  test("which verdicts close fixed remarks", () => {
    const closes = (["match", "mismatch", "unreadable", "unlinked", "unset"] as const).filter(sheetCheckCloses);
    expect(closes).toEqual(["match", "unset"]);
  });

  test("notes only for what didn't settle it", () => {
    expect(sheetCheckNote({ verdict: "mismatch", found: "FA-104", sheetCode: "ZZ-00-FA-102" })).toContain("The title block says FA-104");
    expect(sheetCheckNote({ verdict: "unreadable", found: null, sheetCode: "ZZ-00-FA-102" })).toContain("no remark was closed");
    expect(sheetCheckNote({ verdict: "unlinked", found: null, sheetCode: null })).toContain("no sheet code, so no remark was closed");
    expect(sheetCheckNote({ verdict: "match", found: "FA-102", sheetCode: "ZZ-00-FA-102" })).toBeNull();
    expect(sheetCheckNote({ verdict: "unset", found: null, sheetCode: null })).toBeNull();
  });
});

describe("who decides", () => {
  test("a sheet code locks after the first issue, except for admins and for a drawing that has none", () => {
    expect(sheetCodeLocked({ current: "ZZ-00-FA-102", issued: true, admin: false })).toBe(true);
    expect(sheetCodeLocked({ current: "ZZ-00-FA-102", issued: true, admin: true })).toBe(false);
    expect(sheetCodeLocked({ current: "ZZ-00-FA-102", issued: false, admin: false })).toBe(false);
    expect(sheetCodeLocked({ current: null, issued: true, admin: false })).toBe(false);
  });

  test("a check is decided by its uploader, the drawing's owner or an admin", () => {
    const run = { uploadedById: "u1", ownerId: "o1" };
    expect(canDecideCheckRun({ ...run, userId: "u1", admin: false })).toBe(true);
    expect(canDecideCheckRun({ ...run, userId: "o1", admin: false })).toBe(true);
    expect(canDecideCheckRun({ ...run, userId: "x", admin: true })).toBe(true);
    expect(canDecideCheckRun({ ...run, userId: "x", admin: false })).toBe(false);
    // A deleted uploader or an ownerless drawing doesn't let everyone in.
    expect(canDecideCheckRun({ uploadedById: null, ownerId: null, userId: "x", admin: false })).toBe(false);
  });
});

test("describeUndo", () => {
  expect(describeUndo({ removed: 2, reopened: 1, restored: 0, kept: 0 })).toBe("2 new remarks removed, 1 closed remark reopened");
  expect(describeUndo({ removed: 0, reopened: 0, restored: 0, kept: 0 })).toBe("nothing had changed");
});
