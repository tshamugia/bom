"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";
import { HelpTip } from "@/components/help/help-tip";
import { changeDrawingStatus } from "@/server/actions/drawings";
import { TEXTAREA_CLASS } from "./drawing-form-fields";

/** Shown while the latest revision waits for the second engineer's sign-off. */
export function ReviewPanel({
  revisionId,
  revisionLabel,
  reviewerName,
  canReview,
}: {
  revisionId: string;
  revisionLabel: string;
  reviewerName: string | null;
  canReview: boolean;
}) {
  const [comment, setComment] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  const decide = (to: "awaiting-approval" | "in-progress") => {
    start(async () => {
      const res = await changeDrawingStatus({ revisionId, to, comment: comment.trim() || undefined });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(to === "awaiting-approval" ? `${revisionLabel} approved` : `${revisionLabel} sent back for rework`);
      setComment("");
      router.refresh();
    });
  };

  return (
    <div className="card mb-4" style={{ borderColor: "var(--amber)" }}>
      <div className="card-head">
        <Icon.AlertTriangle className="ico" style={{ color: "var(--amber)", width: 16, height: 16 }} />
        <div className="min-w-0">
          <h3 className="card-title">
            {canReview ? `Your approval is requested for ${revisionLabel}` : `${revisionLabel} is waiting for approval`}{" "}
            <HelpTip topic="drawing-approval" />
          </h3>
          <p className="card-sub">
            {canReview
              ? "Approve to move it to Awaiting approval, or send it back to In Progress with a comment."
              : `Assigned to ${reviewerName ?? "an engineer who is no longer active"}. Only they can approve it.`}
          </p>
        </div>
      </div>
      {canReview && (
        <div className="grid gap-3 p-4">
          <textarea
            className={TEXTAREA_CLASS}
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="Comment — required when sending back"
          />
          <div className="flex flex-wrap justify-end gap-2">
            {!comment.trim() && (
              <span className="muted mr-auto self-center text-[12px]">Sending back needs a comment.</span>
            )}
            <Button variant="outline" disabled={pending || !comment.trim()} onClick={() => decide("in-progress")}>
              Send back
            </Button>
            <Button disabled={pending} onClick={() => decide("awaiting-approval")}>
              <Icon.Check size={14} className="mr-1" /> Approve
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
