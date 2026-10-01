import { describe, expect, test } from "vitest";
import {
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
