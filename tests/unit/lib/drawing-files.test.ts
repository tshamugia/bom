import { describe, expect, test } from "vitest";
import { DRAWING_STATUSES, type DrawingStatus } from "@/lib/drawing-status";
import {
  MAX_DRAWING_FILE_BYTES,
  checkFileType,
  checkFileUpload,
  drawingFileKey,
  drawingFileName,
  fileStatusList,
  fileUploadErrorMessage,
  isFileStatus,
  looksLikePdf,
  parseDrawingFileGate,
  type FileUploadInput,
} from "@/lib/drawing-files";

const allowed = (gate: "approved" | "need-approval") => DRAWING_STATUSES.filter(s => isFileStatus(s, gate));

describe("upload gate", () => {
  test("by default only revisions the client approved take a PDF", () => {
    expect(allowed("approved")).toEqual(["approved-a", "approved-b", "as-built"]);
    expect(fileStatusList("approved")).toBe("Approved A, Approved B or As Built");
  });

  test("an admin can open uploads from Need to be approved", () => {
    expect(allowed("need-approval")).toEqual(["need-approval", "awaiting-approval", "approved-a", "approved-b", "as-built"]);
  });

  test("an unknown stored value falls back to the default", () => {
    expect(parseDrawingFileGate("need-approval")).toBe("need-approval");
    expect(parseDrawingFileGate("whatever")).toBe("approved");
    expect(parseDrawingFileGate(null)).toBe("approved");
  });
});

describe("checkFileUpload", () => {
  const base: FileUploadInput = {
    status: "approved-a",
    gate: "approved",
    isLatest: true,
    actorId: "owner",
    actorIsAdmin: false,
    ownerId: "owner",
  };

  test("the owner uploads to the latest approved revision", () => {
    expect(checkFileUpload(base)).toEqual({ ok: true });
  });

  test("an admin uploads to any drawing; other members can't", () => {
    expect(checkFileUpload({ ...base, actorId: "admin", actorIsAdmin: true })).toEqual({ ok: true });
    expect(checkFileUpload({ ...base, actorId: "someone" })).toEqual({ ok: false, error: "NOT_OWNER" });
    expect(checkFileUpload({ ...base, actorId: "someone", ownerId: null })).toEqual({ ok: false, error: "NOT_OWNER" });
  });

  test("older revisions are locked, even for admins", () => {
    expect(checkFileUpload({ ...base, isLatest: false, actorIsAdmin: true })).toEqual({ ok: false, error: "NOT_LATEST" });
  });

  test.each<DrawingStatus>(["in-progress", "paused", "need-approval", "awaiting-approval"])(
    "%s is too early under the default rule",
    status => {
      const r = checkFileUpload({ ...base, status });
      expect(r).toEqual({ ok: false, error: "STATUS" });
      expect(fileUploadErrorMessage("STATUS", "approved")).toBe(
        "The PDF can be uploaded once the revision is Approved A, Approved B or As Built.",
      );
    },
  );

  test("the relaxed rule opens uploads once the drawing is finished", () => {
    expect(checkFileUpload({ ...base, gate: "need-approval", status: "need-approval" })).toEqual({ ok: true });
    expect(checkFileUpload({ ...base, gate: "need-approval", status: "in-progress" })).toEqual({ ok: false, error: "STATUS" });
  });
});

describe("checkFileType", () => {
  test("takes PDFs, also when the browser reports no type", () => {
    expect(checkFileType({ name: "plan.PDF", type: "application/pdf", size: 10 })).toEqual({ ok: true });
    expect(checkFileType({ name: "plan.pdf", type: "", size: 10 })).toEqual({ ok: true });
  });

  test("refuses other files, empty ones and oversize ones", () => {
    expect(checkFileType({ name: "plan.dwg", type: "", size: 10 })).toEqual({ ok: false, error: "NOT_PDF" });
    expect(checkFileType({ name: "plan.pdf", type: "text/html", size: 10 })).toEqual({ ok: false, error: "NOT_PDF" });
    expect(checkFileType({ name: "plan.pdf", type: "application/pdf", size: 0 })).toEqual({ ok: false, error: "EMPTY" });
    expect(checkFileType({ name: "plan.pdf", type: "application/pdf", size: MAX_DRAWING_FILE_BYTES + 1 }))
      .toEqual({ ok: false, error: "TOO_LARGE" });
  });
});

test("looksLikePdf finds the PDF header, allowing a little junk before it", () => {
  const enc = (s: string) => new TextEncoder().encode(s);
  expect(looksLikePdf(enc("%PDF-1.7\n..."))).toBe(true);
  expect(looksLikePdf(enc("\xEF\xBB\xBF%PDF-1.4"))).toBe(true);
  expect(looksLikePdf(enc("<html><script>"))).toBe(false);
});

describe("names", () => {
  test("downloads are named after the drawing code and revision", () => {
    expect(drawingFileName("ELV-101", 3)).toBe("ELV-101_rev3.pdf");
    expect(drawingFileName("A/B:1", 2)).toBe("A-B-1_rev2.pdf");
  });

  test("keys group files by project, drawing and revision, and never repeat", () => {
    expect(drawingFileKey({ projectCode: "HLT-2026", drawingCode: "ELV-101", revisionNumber: 3, fileId: "abc" }))
      .toBe("drawings/HLT-2026/ELV-101/rev3/ELV-101_rev3_abc.pdf");
    // Codes with spaces, slashes or non-Latin letters still give one tidy folder each.
    expect(drawingFileKey({ projectCode: "BMW / Tbilisi", drawingCode: "CCTV 01 ნახაზი", revisionNumber: 1, fileId: "x" }))
      .toBe("drawings/BMW-Tbilisi/CCTV-01/rev1/CCTV-01_rev1_x.pdf");
    expect(drawingFileKey({ projectCode: "ბმვ", drawingCode: "..", revisionNumber: 1, fileId: "x" }))
      .toBe("drawings/_/_/rev1/__rev1_x.pdf");
  });
});
