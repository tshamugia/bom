// Changing many drawings at once from the /drawings list. The bulk dialogs
// preview these plans and the server applies them, so both skip the same
// drawings for the same reasons. The per-drawing rules are the ones in
// `drawing-status.ts`. Client-safe: no server imports.

import {
  DRAWING_STATUS_LABEL,
  TRANSITION_ERROR_MESSAGE,
  checkDrawingTransition,
  isOwnerChangeBlocked,
  type DrawingStatus,
  type TransitionKind,
} from "./drawing-status";

/** Most drawings one bulk edit may touch — the size of a large project's register. */
export const MAX_BULK_DRAWINGS = 200;

/** What the bulk rules need to know about a drawing and its latest revision. */
export type BulkDrawing = {
  id: string;
  code: string;
  status: DrawingStatus;
  ownerId: string | null;
  reviewerId: string | null;
  reviewedById: string | null;
  /** The latest revision passed the internal check. */
  reviewed: boolean;
  dueDate: string | null;
};

/** A selected drawing the edit leaves as it is, and why. */
export type BulkSkip = { id: string; code: string; reason: string };

export type BulkPlan<T> = { ready: T[]; skipped: BulkSkip[] };

const skip = (d: BulkDrawing, reason: string): BulkSkip => ({ id: d.id, code: d.code, reason });

export type BulkStatusChange = {
  to: DrawingStatus;
  actorId: string;
  /** Approving engineer, when moving to Need to be approved. */
  nextReviewerId: string | null;
  comment: string | null;
};

/** `checkDrawingTransition` for each drawing; the ready ones carry what the server writes. */
export function planBulkStatus<T extends BulkDrawing>(
  rows: T[],
  c: BulkStatusChange,
): BulkPlan<{ row: T; kind: TransitionKind; resetsReview: boolean }> {
  const plan: BulkPlan<{ row: T; kind: TransitionKind; resetsReview: boolean }> = { ready: [], skipped: [] };
  for (const row of rows) {
    const r = checkDrawingTransition({
      from: row.status,
      to: c.to,
      actorId: c.actorId,
      ownerId: row.ownerId,
      reviewerId: row.reviewerId,
      nextReviewerId: c.nextReviewerId,
      reviewed: row.reviewed,
      // The list shows each drawing's latest revision, and only that one moves.
      isLatest: true,
      comment: c.comment,
    });
    if (r.ok) plan.ready.push({ row, kind: r.kind, resetsReview: r.resetsReview });
    else if (r.error === "SAME_STATUS") plan.skipped.push(skip(row, `Already ${DRAWING_STATUS_LABEL[c.to]}.`));
    else plan.skipped.push(skip(row, TRANSITION_ERROR_MESSAGE[r.error]));
  }
  return plan;
}

export const BULK_OWNER_IS_REVIEWER =
  "This engineer approves its latest revision, so they can't own it — create a new revision first.";

export function planBulkOwner<T extends BulkDrawing>(rows: T[], ownerId: string): BulkPlan<T> {
  const plan: BulkPlan<T> = { ready: [], skipped: [] };
  for (const row of rows) {
    if (row.ownerId === ownerId) plan.skipped.push(skip(row, "Already the owner."));
    else if (isOwnerChangeBlocked({ newOwnerId: ownerId, ...row })) plan.skipped.push(skip(row, BULK_OWNER_IS_REVIEWER));
    else plan.ready.push(row);
  }
  return plan;
}

/** `dueDate` null clears it. */
export function planBulkDueDate<T extends BulkDrawing>(rows: T[], dueDate: string | null): BulkPlan<T> {
  const plan: BulkPlan<T> = { ready: [], skipped: [] };
  for (const row of rows) {
    if (row.dueDate === dueDate) {
      plan.skipped.push(skip(row, dueDate ? "Already due on that date." : "Already has no due date."));
    } else {
      plan.ready.push(row);
    }
  }
  return plan;
}
