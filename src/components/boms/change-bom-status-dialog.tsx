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
import { HelpTip } from "@/components/help/help-tip";
import {
  BOM_STATUS_ERROR_MESSAGE, BOM_STATUS_LABEL, bomStatusTargets, checkBomStatusChange, type RevisionStatus,
} from "@/lib/bom-status";
import { changeRevisionStatus } from "@/server/actions/revisions";
import { SELECT_CLASS, TEXTAREA_CLASS } from "@/components/drawings/drawing-form-fields";

export function ChangeBomStatusDialog({
  revisionId,
  letter,
  status,
  sent,
  compact = false,
}: {
  revisionId: string;
  letter: string;
  status: RevisionStatus;
  /** Emailed to procurement already — taking the approval back returns it to Sent to procurement. */
  sent: boolean;
  /** A text link for table rows instead of the primary button. */
  compact?: boolean;
}) {
  const targets = bomStatusTargets({ from: status, sent });
  const initial = targets.length === 1 ? targets[0] : "";
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState<RevisionStatus | "">(initial);
  const [comment, setComment] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  if (targets.length === 0) return null;

  const check = to ? checkBomStatusChange({ from: status, to, sent, isLatest: true, comment }) : null;
  // A missing comment is what the field below asks for, so it isn't shown as an error.
  const blockingError = check && !check.ok && check.error !== "COMMENT_REQUIRED" ? check.error : null;
  const approving = to === "approved";

  function reset() {
    setTo(initial);
    setComment("");
  }

  const submit = () => {
    if (!to) return;
    start(async () => {
      const res = await changeRevisionStatus({ revisionId, to, comment: comment.trim() });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`Rev ${letter} is now ${BOM_STATUS_LABEL[to]}`);
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
          compact
            ? <button type="button" className="text-[var(--color-info)] hover:underline">Change status</button>
            : <Button variant="outline"><Icon.CheckCircle size={14} /> Change status</Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change status of Rev {letter}</DialogTitle>
          <DialogDescription>
            Currently <strong>{BOM_STATUS_LABEL[status]}</strong>. Your name, the time and the comment are recorded with the change.{" "}
            <HelpTip topic="bom-statuses" />
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="bom-status-to">New status</Label>
            <select
              id="bom-status-to"
              className={SELECT_CLASS}
              value={to}
              onChange={e => setTo(e.target.value as RevisionStatus)}
            >
              {targets.length > 1 && <option value="">— Select status —</option>}
              {targets.map(s => (
                <option key={s} value={s}>
                  {BOM_STATUS_LABEL[s]}{s !== "approved" ? " — approval taken back" : " — confirmed by the client"}
                </option>
              ))}
            </select>
            {blockingError && (
              <p className="text-[12px] text-[var(--color-danger)]">{BOM_STATUS_ERROR_MESSAGE[blockingError]}</p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="bom-status-comment">Comment</Label>
            <textarea
              id="bom-status-comment"
              className={TEXTAREA_CLASS}
              value={comment}
              maxLength={2000}
              onChange={e => setComment(e.target.value)}
              placeholder={approving
                ? "Who confirmed it and how — e.g. client's email of 5 Oct"
                : "Why the approval no longer stands"}
            />
            <p className="text-[12px] text-[var(--color-text-3)]">Required. It shows on the BOM and in the activity log.</p>
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
