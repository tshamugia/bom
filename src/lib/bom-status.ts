// Shared by the Drizzle schema, server actions and client components, so this
// module must stay free of server-only and DB imports.

/** Every value of the `revision_status` enum, in lifecycle order. */
export const REVISION_STATUSES = [
  "draft",
  "committed",
  "in-progress",
  "review",
  "approved",
  "locked",
] as const;

export type RevisionStatus = (typeof REVISION_STATUSES)[number];

/**
 * The statuses a BOM moves through in practice, as the BOM Builder tabs show
 * them. `in-progress` and `locked` come only from the internal approval
 * workflow, which has no UI yet.
 */
export const BOM_STATUSES = ["draft", "committed", "review", "approved"] as const satisfies readonly RevisionStatus[];

export type BomStatus = (typeof BOM_STATUSES)[number];

export const BOM_STATUS_LABEL: Record<RevisionStatus, string> = {
  "draft": "Draft",
  "committed": "Committed",
  "in-progress": "Returned",
  "review": "Sent to procurement",
  "approved": "Approved",
  "locked": "Released",
};

/**
 * Where a status change can go. Draft → Committed is the Commit button and
 * Sent to procurement is the procurement email; by hand there is only the
 * client's approval and taking it back, to where the revision was before.
 */
export function bomStatusTargets(i: { from: RevisionStatus; sent: boolean }): RevisionStatus[] {
  if (i.from === "committed" || i.from === "review") return ["approved"];
  if (i.from === "approved") return [i.sent ? "review" : "committed"];
  return [];
}

export type BomStatusChangeInput = {
  from: RevisionStatus;
  to: RevisionStatus;
  /** Whether the revision was already emailed to procurement. */
  sent: boolean;
  /** Only the BOM's latest committed revision changes status; older ones keep theirs. */
  isLatest: boolean;
  comment?: string | null;
};

export type BomStatusError =
  | "DRAFT"
  | "REVISION_LOCKED"
  | "SAME_STATUS"
  | "NOT_ALLOWED"
  | "COMMENT_REQUIRED";

export const BOM_STATUS_ERROR_MESSAGE: Record<BomStatusError, string> = {
  DRAFT: "A draft changes status only by committing it.",
  REVISION_LOCKED: "Only the latest committed revision of a BOM can change status.",
  SAME_STATUS: "The revision already has this status.",
  NOT_ALLOWED: "This status can't be set by hand.",
  COMMENT_REQUIRED: "Add a comment — who confirmed it and how.",
};

export function checkBomStatusChange(i: BomStatusChangeInput): { ok: true } | { ok: false; error: BomStatusError } {
  if (i.from === "draft") return { ok: false, error: "DRAFT" };
  if (!i.isLatest) return { ok: false, error: "REVISION_LOCKED" };
  if (i.from === i.to) return { ok: false, error: "SAME_STATUS" };
  if (!bomStatusTargets(i).includes(i.to)) return { ok: false, error: "NOT_ALLOWED" };
  if (!i.comment?.trim()) return { ok: false, error: "COMMENT_REQUIRED" };
  return { ok: true };
}

/**
 * A revision goes to procurement once, when it is committed — before or after
 * the client approved it.
 */
export function canSendToProcurement(i: { status: RevisionStatus; sent: boolean }): boolean {
  return !i.sent && (i.status === "committed" || i.status === "approved");
}

/** An admin deleting a BOM says why; the reason goes to the audit log. */
export const BOM_DELETE_REASON_MIN = 3;
