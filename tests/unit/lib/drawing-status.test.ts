import { describe, expect, test } from "vitest";
import {
  checkDrawingTransition,
  isDrawingOverdue,
  todayIso,
  type TransitionInput,
} from "@/lib/drawing-status";

const OWNER = "owner";
const REVIEWER = "reviewer";
const OTHER = "other";

function t(overrides: Partial<TransitionInput>): ReturnType<typeof checkDrawingTransition> {
  return checkDrawingTransition({
    from: "in-progress",
    to: "paused",
    actorId: OWNER,
    ownerId: OWNER,
    reviewerId: null,
    reviewed: false,
    isLatest: true,
    ...overrides,
  });
}

describe("checkDrawingTransition", () => {
  test("only the latest revision can move", () => {
    expect(t({ isLatest: false })).toEqual({ ok: false, error: "REVISION_LOCKED" });
  });

  test("rejects a no-op change", () => {
    expect(t({ to: "in-progress" })).toEqual({ ok: false, error: "SAME_STATUS" });
  });

  test("free moves between working statuses", () => {
    expect(t({ to: "paused" })).toMatchObject({ ok: true, kind: "plain" });
    expect(t({ from: "paused", to: "in-progress" })).toMatchObject({ ok: true, kind: "plain", resetsReview: true });
  });

  test("requesting approval needs a reviewer who is not the owner", () => {
    expect(t({ to: "need-approval" })).toEqual({ ok: false, error: "REVIEWER_REQUIRED" });
    expect(t({ to: "need-approval", nextReviewerId: OWNER })).toEqual({ ok: false, error: "REVIEWER_IS_OWNER" });
    expect(t({ to: "need-approval", nextReviewerId: REVIEWER })).toMatchObject({ ok: true, kind: "request" });
  });

  test("the approval gate cannot be skipped", () => {
    for (const to of ["awaiting-approval", "approved-a", "approved-b", "as-built"] as const) {
      expect(t({ to })).toEqual({ ok: false, error: "REVIEW_REQUIRED" });
    }
  });

  test("only the assigned reviewer approves", () => {
    const base = { from: "need-approval" as const, to: "awaiting-approval" as const, reviewerId: REVIEWER };
    expect(t({ ...base, actorId: OWNER })).toEqual({ ok: false, error: "ONLY_REVIEWER_CAN_APPROVE" });
    expect(t({ ...base, actorId: OTHER })).toEqual({ ok: false, error: "ONLY_REVIEWER_CAN_APPROVE" });
    expect(t({ ...base, actorId: REVIEWER })).toMatchObject({ ok: true, kind: "approve", resetsReview: false });
  });

  test("a reviewer who became the owner cannot approve their own drawing", () => {
    expect(t({ from: "need-approval", to: "awaiting-approval", reviewerId: OWNER, actorId: OWNER }))
      .toEqual({ ok: false, error: "REVIEWER_IS_OWNER" });
  });

  test("approval pending cannot jump straight to a client verdict", () => {
    expect(t({ from: "need-approval", to: "approved-a", reviewerId: REVIEWER, actorId: REVIEWER }))
      .toEqual({ ok: false, error: "REVIEW_REQUIRED" });
  });

  test("the reviewer must explain a send-back", () => {
    const base = { from: "need-approval" as const, to: "in-progress" as const, reviewerId: REVIEWER, actorId: REVIEWER };
    expect(t(base)).toEqual({ ok: false, error: "COMMENT_REQUIRED" });
    expect(t({ ...base, comment: "   " })).toEqual({ ok: false, error: "COMMENT_REQUIRED" });
    expect(t({ ...base, comment: "Fix the legend" })).toMatchObject({ ok: true, kind: "reject", resetsReview: true });
  });

  test("the owner can withdraw an approval request without a comment", () => {
    expect(t({ from: "need-approval", to: "in-progress", reviewerId: REVIEWER, actorId: OWNER }))
      .toMatchObject({ ok: true, kind: "plain", resetsReview: true });
  });

  test("once reviewed, the client verdict statuses are open to anyone", () => {
    const reviewed = { reviewed: true, actorId: OTHER };
    expect(t({ ...reviewed, from: "awaiting-approval", to: "approved-a" })).toMatchObject({ ok: true });
    expect(t({ ...reviewed, from: "awaiting-approval", to: "approved-b" })).toMatchObject({ ok: true });
    expect(t({ ...reviewed, from: "approved-b", to: "as-built" })).toMatchObject({ ok: true });
    expect(t({ ...reviewed, from: "paused", to: "awaiting-approval" })).toMatchObject({ ok: true });
  });
});

describe("isDrawingOverdue", () => {
  test("past due and still open", () => {
    expect(isDrawingOverdue("2026-09-01", "in-progress", "2026-09-28")).toBe(true);
    expect(isDrawingOverdue("2026-09-01", "awaiting-approval", "2026-09-28")).toBe(true);
  });

  test("not overdue on the due date itself, without a date, or once closed", () => {
    expect(isDrawingOverdue("2026-09-28", "in-progress", "2026-09-28")).toBe(false);
    expect(isDrawingOverdue(null, "in-progress", "2026-09-28")).toBe(false);
    expect(isDrawingOverdue("2026-09-01", "approved-b", "2026-09-28")).toBe(false);
    expect(isDrawingOverdue("2026-09-01", "as-built", "2026-09-28")).toBe(false);
  });
});

test("todayIso uses the Tbilisi calendar day", () => {
  // 21:30 UTC is already the next day in Tbilisi (UTC+4).
  expect(todayIso(new Date("2026-09-28T21:30:00Z"))).toBe("2026-09-29");
  expect(todayIso(new Date("2026-09-28T10:00:00Z"))).toBe("2026-09-28");
});
