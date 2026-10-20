import { describe, expect, test } from "vitest";
import {
  BULK_OWNER_IS_REVIEWER,
  planBulkDueDate,
  planBulkOwner,
  planBulkStatus,
  type BulkDrawing,
} from "@/lib/drawing-bulk";
import { TRANSITION_ERROR_MESSAGE } from "@/lib/drawing-status";

const drawing = (code: string, patch: Partial<BulkDrawing> = {}): BulkDrawing => ({
  id: code.toLowerCase(),
  code,
  status: "in-progress",
  ownerId: "owner",
  reviewerId: null,
  reviewedById: null,
  reviewed: false,
  dueDate: null,
  ...patch,
});

const ids = (rows: { id: string }[]) => rows.map(r => r.id);

describe("planBulkStatus", () => {
  const change = { actorId: "me", nextReviewerId: null, comment: null };

  test("moves the drawings that can, and says why the others stay", () => {
    const plan = planBulkStatus(
      [
        drawing("A-001"),
        drawing("A-002", { status: "paused" }),
        drawing("A-003", { status: "need-approval", reviewerId: "rev" }),
      ],
      { ...change, to: "paused" },
    );
    expect(plan.ready.map(r => r.row.code)).toEqual(["A-001", "A-003"]);
    expect(plan.skipped).toEqual([{ id: "a-002", code: "A-002", reason: "Already Paused." }]);
  });

  test("Approved needs the internal check on each drawing", () => {
    const plan = planBulkStatus(
      [drawing("A-001", { status: "awaiting-approval", reviewed: true }), drawing("A-002")],
      { ...change, to: "approved-a" },
    );
    expect(plan.ready.map(r => r.row.code)).toEqual(["A-001"]);
    expect(plan.skipped[0]).toMatchObject({ code: "A-002", reason: TRANSITION_ERROR_MESSAGE.REVIEW_REQUIRED });
  });

  test("an approval request skips the drawings the chosen engineer owns", () => {
    const plan = planBulkStatus(
      [drawing("A-001"), drawing("A-002", { ownerId: "rev" })],
      { ...change, to: "need-approval", nextReviewerId: "rev" },
    );
    expect(plan.ready).toEqual([expect.objectContaining({ kind: "request", resetsReview: true })]);
    expect(plan.skipped[0]).toMatchObject({ code: "A-002", reason: TRANSITION_ERROR_MESSAGE.REVIEWER_IS_OWNER });
  });

  test("only the assigned engineer approves, and sending back needs a comment", () => {
    const rows = [
      drawing("A-001", { status: "need-approval", reviewerId: "me" }),
      drawing("A-002", { status: "need-approval", reviewerId: "someone-else" }),
    ];
    const approve = planBulkStatus(rows, { ...change, to: "awaiting-approval" });
    expect(approve.ready.map(r => [r.row.code, r.kind])).toEqual([["A-001", "approve"]]);
    expect(approve.skipped[0].reason).toBe(TRANSITION_ERROR_MESSAGE.ONLY_REVIEWER_CAN_APPROVE);

    const back = planBulkStatus(rows, { ...change, to: "in-progress" });
    expect(ids(back.skipped)).toEqual(["a-001"]);
    expect(back.skipped[0].reason).toBe(TRANSITION_ERROR_MESSAGE.COMMENT_REQUIRED);
    const withComment = planBulkStatus(rows, { ...change, to: "in-progress", comment: "Fix the legend" });
    expect(withComment.ready.map(r => r.kind)).toEqual(["reject", "plain"]);
  });
});

describe("planBulkOwner", () => {
  test("skips drawings already theirs and those they are approving", () => {
    const plan = planBulkOwner(
      [
        drawing("A-001"),
        drawing("A-002", { ownerId: "new" }),
        drawing("A-003", { status: "need-approval", reviewerId: "new" }),
        drawing("A-004", { status: "approved-a", reviewedById: "new", reviewed: true }),
      ],
      "new",
    );
    expect(ids(plan.ready)).toEqual(["a-001"]);
    expect(plan.skipped.map(s => [s.code, s.reason])).toEqual([
      ["A-002", "Already the owner."],
      ["A-003", BULK_OWNER_IS_REVIEWER],
      ["A-004", BULK_OWNER_IS_REVIEWER],
    ]);
  });
});

describe("planBulkDueDate", () => {
  test("sets or clears the date, skipping drawings that already have it", () => {
    const rows = [drawing("A-001", { dueDate: "2026-11-01" }), drawing("A-002")];
    expect(ids(planBulkDueDate(rows, "2026-11-01").ready)).toEqual(["a-002"]);
    const clear = planBulkDueDate(rows, null);
    expect(ids(clear.ready)).toEqual(["a-001"]);
    expect(clear.skipped[0].reason).toBe("Already has no due date.");
  });
});
