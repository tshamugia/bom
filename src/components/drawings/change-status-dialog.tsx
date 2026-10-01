"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Icon } from "@/components/icons";
import { BlockedNote } from "@/components/help/blocked-note";
import { HelpTip } from "@/components/help/help-tip";
import {
  DRAWING_STATUSES, DRAWING_STATUS_LABEL, TRANSITION_ERROR_MESSAGE,
  checkDrawingTransition, formatDrawingRevision, type DrawingStatus, type TransitionError,
} from "@/lib/drawing-status";
import { changeDrawingStatus } from "@/server/actions/drawings";
import { SELECT_CLASS, TEXTAREA_CLASS, type UserOption } from "./drawing-form-fields";

/** Shown next to a status that can't be picked right now. */
const OPTION_BLOCK: Partial<Record<TransitionError, string>> = {
  REVIEW_REQUIRED: "after the internal check",
  ONLY_REVIEWER_CAN_APPROVE: "only the approving engineer",
  REVIEWER_IS_OWNER: "not by the owner",
};

/** Fills in what the dialog asks for later, so only the hard rules block an option. */
const STAND_IN_REVIEWER = "(stand-in reviewer)";

export function ChangeStatusDialog({
  revisionId,
  revisionNumber,
  status,
  ownerId,
  reviewerId,
  reviewed,
  currentUserId,
  users,
}: {
  revisionId: string;
  revisionNumber: number;
  status: DrawingStatus;
  ownerId: string | null;
  reviewerId: string | null;
  reviewed: boolean;
  currentUserId: string;
  users: UserOption[];
}) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState<DrawingStatus | "">("");
  const [nextReviewerId, setNextReviewerId] = useState("");
  const [comment, setComment] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  const reviewers = users.filter(u => u.id !== ownerId && u.id !== currentUserId);
  const check = to
    ? checkDrawingTransition({
        from: status,
        to,
        actorId: currentUserId,
        ownerId,
        reviewerId,
        nextReviewerId: nextReviewerId || null,
        reviewed,
        isLatest: true,
        comment,
      })
    : null;
  // A missing reviewer is filled in below, so it is not worth an error line.
  const blockingError = check && !check.ok && check.error !== "REVIEWER_REQUIRED" ? check.error : null;

  const blockedBy = (next: DrawingStatus): TransitionError | null => {
    const r = checkDrawingTransition({
      from: status,
      to: next,
      actorId: currentUserId,
      ownerId,
      reviewerId,
      nextReviewerId: STAND_IN_REVIEWER,
      reviewed,
      isLatest: true,
      comment: "-",
    });
    return r.ok || !OPTION_BLOCK[r.error] ? null : r.error;
  };
  const options = DRAWING_STATUSES.filter(s => s !== status).map(s => ({ status: s, block: blockedBy(s) }));
  const blocks = new Set(options.map(o => o.block).filter(Boolean));

  function reset() {
    setTo("");
    setNextReviewerId("");
    setComment("");
  }

  const submit = () => {
    if (!to) return;
    start(async () => {
      const res = await changeDrawingStatus({
        revisionId,
        to,
        comment: comment.trim() || undefined,
        reviewerId: to === "need-approval" ? nextReviewerId : undefined,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Status changed to ${DRAWING_STATUS_LABEL[to]}`);
      setOpen(false);
      reset();
      router.refresh();
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger
        render={
          <button type="button" className="btn btn-primary">
            <Icon.Send className="ico" /> Change status
          </button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change status of {formatDrawingRevision(revisionNumber)}</DialogTitle>
          <DialogDescription>
            Currently <strong>{DRAWING_STATUS_LABEL[status]}</strong>. Everyone following the drawing gets an email with the revision note and your comment.{" "}
            <HelpTip topic="drawing-statuses" />
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="drawing-status-to">New status</Label>
            <select
              id="drawing-status-to"
              className={SELECT_CLASS}
              value={to}
              onChange={e => setTo(e.target.value as DrawingStatus)}
            >
              <option value="">— Select status —</option>
              {options.map(o => (
                <option key={o.status} value={o.status} disabled={!!o.block}>
                  {DRAWING_STATUS_LABEL[o.status]}{o.block ? ` — ${OPTION_BLOCK[o.block]}` : ""}
                </option>
              ))}
            </select>
            {!to && blocks.has("REVIEW_REQUIRED") && (
              <BlockedNote topic="drawing-approval">
                Awaiting approval and later open up once a second engineer approves the revision. Pick Need to be approved first.
              </BlockedNote>
            )}
            {!to && blocks.has("ONLY_REVIEWER_CAN_APPROVE") && (
              <BlockedNote topic="drawing-approval">
                This revision waits for the approving engineer — only they can move it to Awaiting approval.
              </BlockedNote>
            )}
            {blockingError && (
              <p className="text-[12px] text-[var(--color-danger)]">{TRANSITION_ERROR_MESSAGE[blockingError]}</p>
            )}
          </div>

          {to === "need-approval" && (
            <div className="grid gap-1.5">
              <Label htmlFor="drawing-status-reviewer">Approving engineer</Label>
              <select
                id="drawing-status-reviewer"
                className={SELECT_CLASS}
                value={nextReviewerId}
                onChange={e => setNextReviewerId(e.target.value)}
              >
                <option value="">— Select engineer —</option>
                {reviewers.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
              <p className="text-[12px] text-[var(--color-text-3)]">
                Must be someone other than the drawing owner and you. Only this engineer can approve the revision.
              </p>
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="drawing-status-comment">
              Comment <span className="text-[var(--color-text-3)]">(optional)</span>
            </Label>
            <textarea
              id="drawing-status-comment"
              className={TEXTAREA_CLASS}
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder={to === "approved-b" ? "Client comments…" : "Anything the team should know"}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button onClick={submit} disabled={pending || !check?.ok}>
            {pending ? "Saving…" : "Change status"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
