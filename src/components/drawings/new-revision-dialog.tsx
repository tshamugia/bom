"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Icon } from "@/components/icons";
import { formatDrawingRevision } from "@/lib/drawing-status";
import { createDrawingRevision } from "@/server/actions/drawings";
import { TEXTAREA_CLASS } from "./drawing-form-fields";

export function NewRevisionDialog({
  drawingId,
  currentNumber,
}: {
  drawingId: string;
  currentNumber: number;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const current = formatDrawingRevision(currentNumber);
  const next = formatDrawingRevision(currentNumber + 1);

  const submit = () => {
    start(async () => {
      const res = await createDrawingRevision({ drawingId, commitMessage: message.trim() });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${formatDrawingRevision(res.number)} created`);
      setOpen(false);
      setMessage("");
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button type="button" className="btn">
            <Icon.Branch className="ico" /> New revision
          </button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create {next}</DialogTitle>
          <DialogDescription>
            {current} is locked with its current status. {next} starts as In Progress.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-1.5">
          <Label htmlFor="drawing-rev-message">What changed?</Label>
          <textarea
            id="drawing-rev-message"
            className={TEXTAREA_CLASS}
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="e.g. Updated camera positions after client comments"
            autoFocus
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button onClick={submit} disabled={pending || !message.trim()}>
            {pending ? "Creating…" : `Create ${next}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
