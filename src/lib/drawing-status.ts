// Shared by the Drizzle schema, server actions and client components, so this
// module must stay free of server-only and DB imports.

export const DRAWING_STATUSES = [
  "in-progress",
  "paused",
  "need-approval",
  "awaiting-approval",
  "approved-a",
  "approved-b",
  "as-built",
] as const;

export type DrawingStatus = (typeof DRAWING_STATUSES)[number];

export const DRAWING_STATUS_LABEL: Record<DrawingStatus, string> = {
  "in-progress": "In Progress",
  "paused": "Paused",
  "need-approval": "Need to be approved",
  "awaiting-approval": "Awaiting approval",
  "approved-a": "Approved A",
  "approved-b": "Approved B (with comments)",
  "as-built": "As Built",
};

/** Reachable only after the second engineer signed the revision off. */
const POST_REVIEW: ReadonlySet<DrawingStatus> = new Set([
  "awaiting-approval",
  "approved-a",
  "approved-b",
  "as-built",
]);

/** Work on the drawing is finished — a past due date no longer counts as overdue. */
const CLOSED: ReadonlySet<DrawingStatus> = new Set(["approved-a", "approved-b", "as-built"]);

export function isClosedStatus(status: DrawingStatus): boolean {
  return CLOSED.has(status);
}

export function formatDrawingRevision(n: number): string {
  return `rev${n}`;
}

export type TransitionInput = {
  from: DrawingStatus;
  to: DrawingStatus;
  actorId: string;
  ownerId: string | null;
  /** Second engineer currently assigned to the revision. */
  reviewerId: string | null;
  /** Reviewer picked in this request — only read when moving to need-approval. */
  nextReviewerId?: string | null;
  /** Whether the revision already passed the internal check. */
  reviewed: boolean;
  /** Older revisions are frozen; only the latest one moves. */
  isLatest: boolean;
  comment?: string | null;
};

export type TransitionError =
  | "REVISION_LOCKED"
  | "SAME_STATUS"
  | "REVIEWER_REQUIRED"
  | "REVIEWER_IS_OWNER"
  | "ONLY_REVIEWER_CAN_APPROVE"
  | "REVIEW_REQUIRED"
  | "COMMENT_REQUIRED";

export type TransitionKind = "request" | "approve" | "reject" | "plain";

export type TransitionResult =
  | { ok: true; kind: TransitionKind; resetsReview: boolean }
  | { ok: false; error: TransitionError };

export const TRANSITION_ERROR_MESSAGE: Record<TransitionError, string> = {
  REVISION_LOCKED: "Only the latest revision can change status.",
  SAME_STATUS: "The drawing already has this status.",
  REVIEWER_REQUIRED: "Pick the engineer who will approve this revision.",
  REVIEWER_IS_OWNER: "The approving engineer must be someone other than the drawing owner.",
  ONLY_REVIEWER_CAN_APPROVE: "Only the assigned engineer can approve this revision.",
  REVIEW_REQUIRED: "This revision has to be approved by a second engineer first.",
  COMMENT_REQUIRED: "Add a comment explaining why the revision is sent back.",
};

/**
 * Status changes are free, with one gate: a revision reaches Awaiting approval
 * (and everything after it) only once a second engineer — not the owner —
 * approved it from Need to be approved. Going back to In Progress means the
 * drawing is being reworked, so that sign-off is cleared.
 */
export function checkDrawingTransition(i: TransitionInput): TransitionResult {
  if (!i.isLatest) return { ok: false, error: "REVISION_LOCKED" };
  if (i.from === i.to) return { ok: false, error: "SAME_STATUS" };

  const resetsReview = i.to === "in-progress" || i.to === "need-approval";

  if (i.from === "need-approval") {
    if (i.to === "awaiting-approval") {
      if (i.actorId !== i.reviewerId) return { ok: false, error: "ONLY_REVIEWER_CAN_APPROVE" };
      if (i.actorId === i.ownerId) return { ok: false, error: "REVIEWER_IS_OWNER" };
      return { ok: true, kind: "approve", resetsReview: false };
    }
    if (POST_REVIEW.has(i.to)) return { ok: false, error: "REVIEW_REQUIRED" };
    if (i.to === "in-progress" && i.actorId === i.reviewerId) {
      if (!i.comment?.trim()) return { ok: false, error: "COMMENT_REQUIRED" };
      return { ok: true, kind: "reject", resetsReview };
    }
    return { ok: true, kind: "plain", resetsReview };
  }

  if (i.to === "need-approval") {
    if (!i.nextReviewerId) return { ok: false, error: "REVIEWER_REQUIRED" };
    if (i.nextReviewerId === i.ownerId) return { ok: false, error: "REVIEWER_IS_OWNER" };
    return { ok: true, kind: "request", resetsReview };
  }

  if (POST_REVIEW.has(i.to) && !i.reviewed) return { ok: false, error: "REVIEW_REQUIRED" };

  return { ok: true, kind: "plain", resetsReview };
}

const tbilisiDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Tbilisi",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's date in Tbilisi as `YYYY-MM-DD`, comparable with Postgres `date` strings. */
export function todayIso(now: Date = new Date()): string {
  return tbilisiDay.format(now);
}

export function isDrawingOverdue(
  dueDate: string | null,
  status: DrawingStatus,
  today: string = todayIso(),
): boolean {
  return !!dueDate && dueDate < today && !isClosedStatus(status);
}
