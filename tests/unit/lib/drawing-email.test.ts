import { describe, expect, test } from "vitest";
import {
  buildDrawingStatusDigestEmail,
  buildDrawingStatusEmail,
  buildTransmittalEmail,
  pickDrawingRecipients,
  type DrawingStatusEmailInput,
} from "@/server/lib/drawing-email";

describe("pickDrawingRecipients", () => {
  test("merges lists, adds owner and reviewer, drops duplicates and the actor", () => {
    const ids = pickDrawingRecipients({
      globalUserIds: ["a", "b"],
      projectUserIds: ["b", "c"],
      ownerId: "owner",
      reviewerId: "a",
      actorId: "c",
    });
    expect(ids.sort()).toEqual(["a", "b", "owner"]);
  });

  test("the actor is never emailed, even as owner", () => {
    expect(pickDrawingRecipients({
      globalUserIds: [],
      projectUserIds: [],
      ownerId: "me",
      reviewerId: null,
      actorId: "me",
    })).toEqual([]);
  });
});

const base: DrawingStatusEmailInput = {
  appUrl: "https://bom.example.com/",
  drawingId: "d1",
  projectCode: "HLT",
  projectName: "Hilton",
  code: "ELV-101",
  name: "Ground floor CCTV",
  discipline: "CCTV",
  revisionNumber: 2,
  from: "in-progress",
  to: "need-approval",
  kind: "request",
  actorName: "Nino",
  ownerName: "Nino",
  reviewerName: "Giorgi",
  dueDate: "2026-10-15",
  commitMessage: "Moved cameras after client walk-through",
  comment: "Please check the lobby coverage",
};

describe("buildDrawingStatusEmail", () => {
  test("subject names project, drawing, revision and new status", () => {
    expect(buildDrawingStatusEmail(base).subject).toBe("[HLT] ELV-101 rev2 — Need to be approved");
  });

  test("body carries the revision note, comment and link", () => {
    const { text } = buildDrawingStatusEmail(base);
    expect(text).toContain("Nino requested approval from Giorgi.");
    expect(text).toContain("In Progress → Need to be approved");
    expect(text).toContain("Moved cameras after client walk-through");
    expect(text).toContain("Please check the lobby coverage");
    expect(text).toContain("https://bom.example.com/drawings/d1");
  });

  test("omits empty facts and the comment block when there is no comment", () => {
    const { text } = buildDrawingStatusEmail({
      ...base,
      kind: "plain",
      from: "awaiting-approval",
      to: "approved-a",
      reviewerName: null,
      dueDate: null,
      comment: null,
    });
    expect(text).not.toContain("Approver:");
    expect(text).not.toContain("Due date:");
    expect(text).not.toContain("Comment:");
    expect(text).toContain("Nino changed the drawing status.");
  });

  test("send-back wording", () => {
    const { text } = buildDrawingStatusEmail({ ...base, kind: "reject", from: "need-approval", to: "in-progress" });
    expect(text).toContain("sent the drawing back for rework");
  });
});

describe("buildDrawingStatusDigestEmail", () => {
  const item = (code: string, projectCode = "HLT") => ({
    drawingId: code.toLowerCase(),
    projectCode,
    code,
    name: `Drawing ${code}`,
    revisionNumber: 1,
    from: "in-progress" as const,
    kind: "plain" as const,
  });
  const digest = {
    appUrl: "https://bom.example.com/",
    to: "approved-a" as const,
    actorName: "Nino",
    reviewerName: null,
    comment: null,
    items: [item("ELV-101"), item("ELV-102")],
  };

  test("one email lists every drawing with its old status and link", () => {
    const { subject, text } = buildDrawingStatusDigestEmail(digest);
    expect(subject).toBe("[HLT] 2 drawings — Approved A");
    expect(text).toContain("Nino changed the status of 2 drawings to Approved A.");
    expect(text).toContain("HLT · ELV-101 rev1 — Drawing ELV-101");
    expect(text).toContain("In Progress → Approved A");
    expect(text).toContain("https://bom.example.com/drawings/elv-102");
    expect(text).not.toContain("Comment:");
  });

  test("drops the project tag across projects and words an approval request", () => {
    const { subject, text } = buildDrawingStatusDigestEmail({
      ...digest,
      to: "need-approval",
      reviewerName: "Giorgi",
      comment: "Ready for checking",
      items: [{ ...item("ELV-101"), kind: "request" }, { ...item("FA-001", "BMW"), kind: "request" }],
    });
    expect(subject).toBe("2 drawings — Need to be approved");
    expect(text).toContain("Nino requested approval of 2 drawings from Giorgi.");
    expect(text).toContain("Comment:\nReady for checking");
  });
});

describe("buildTransmittalEmail", () => {
  const base = {
    appUrl: "https://bom.example/",
    drawingId: "d1",
    projectCode: "HLT",
    projectName: "Hilton",
    code: "ELV-101",
    name: "CCTV layout",
    revisionNumber: 3,
    status: "approved-a" as const,
    purpose: "construction" as const,
    senderName: "Tengo",
    recipientName: "Site Foreman",
    note: null,
  };

  test("names the revision, purpose and link", () => {
    const { subject, text } = buildTransmittalEmail(base);
    expect(subject).toBe("[HLT] ELV-101 rev3 issued to you — For construction");
    expect(text).toContain("Tengo issued ELV-101 rev3 to you — for construction.");
    expect(text).toContain("Revision: rev3 (Approved A)");
    expect(text).toContain("https://bom.example/drawings/d1");
    expect(text).not.toContain("Note:");
  });

  test("includes the note when given", () => {
    expect(buildTransmittalEmail({ ...base, note: "  Printed copy on site  " }).text).toContain("Note:\nPrinted copy on site");
  });

  test("links the PDF when the revision has one to send", () => {
    expect(buildTransmittalEmail(base).text).not.toContain("PDF");
    expect(buildTransmittalEmail({ ...base, pdfFileId: "f1" }).text).toContain("Open the PDF: https://bom.example/api/drawings/files/f1");
  });
});
