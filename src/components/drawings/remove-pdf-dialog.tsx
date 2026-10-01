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
import { removeDrawingFile } from "@/server/actions/drawing-files";
import { TEXTAREA_CLASS } from "./drawing-form-fields";

/** Admins take a wrong PDF off its revision; the history keeps the reason. */
export function RemovePdfDialog({ fileId, fileName }: { fileId: string; fileName: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  const submit = () =>
    start(async () => {
      const res = await removeDrawingFile({ fileId, reason: reason.trim() });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${fileName} removed`);
      setOpen(false);
      setReason("");
      router.refresh();
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button type="button" className="btn btn-sm btn-ghost" aria-label={`Remove ${fileName}`}>
            <Icon.Trash className="ico" /> Remove
          </button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove {fileName}?</DialogTitle>
          <DialogDescription>
            Nobody can open it from the drawing any more. The file stays in the archive and the reason is recorded in the history.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="drawing-pdf-remove-reason">Why?</Label>
          <textarea
            id="drawing-pdf-remove-reason"
            className={TEXTAREA_CLASS}
            value={reason}
            maxLength={500}
            onChange={e => setReason(e.target.value)}
            placeholder="e.g. Wrong drawing uploaded"
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button variant="destructive" onClick={submit} disabled={pending || !reason.trim()}>
            {pending ? "Removing…" : "Remove PDF"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
