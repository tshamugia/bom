"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";
import { confirmDrawingCheckRun, markDrawingCheckWrongFile } from "@/server/actions/drawing-check-runs";

/**
 * What a person decides about a finished check (issue #18): a held run is
 * confirmed as this drawing's file or set aside; the latest run that changed
 * remarks can be marked as the wrong file, which undoes it.
 */
export function CheckRunActions({
  runId,
  fileName,
  held,
  linkedSheetCode,
}: {
  runId: string;
  fileName: string;
  /** Waiting for a person: nothing was changed yet. */
  held: boolean;
  /** The sheet code this upload gave the drawing; "Wrong file" clears it. */
  linkedSheetCode: string | null;
}) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const confirm = () =>
    start(async () => {
      const res = await confirmDrawingCheckRun({ runId });
      if (!res.ok) {
        toast.error(res.error);
        router.refresh();
        return;
      }
      toast.success("Confirmed as this drawing's file", { description: res.summary });
      router.refresh();
    });

  const wrongFile = () =>
    start(async () => {
      const res = await markDrawingCheckWrongFile({ runId });
      if (!res.ok) {
        toast.error(res.error);
        setOpen(false);
        router.refresh();
        return;
      }
      toast.success("Marked as the wrong file", { description: res.summary });
      setOpen(false);
      router.refresh();
    });

  return (
    <div className="flex flex-wrap gap-2 max-[701px]:[&>*]:flex-1">
      {held && (
        <button type="button" className="btn btn-sm btn-primary" onClick={confirm} disabled={pending}>
          <Icon.Check className="ico" /> {pending ? "Saving…" : "It's this drawing's file"}
        </button>
      )}
      <Dialog open={open} onOpenChange={next => !pending && setOpen(next)}>
        <DialogTrigger
          render={
            <button type="button" className="btn btn-sm" disabled={pending}>
              <Icon.X className="ico" /> Wrong file
            </button>
          }
        />
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mark as the wrong file?</DialogTitle>
            <DialogDescription>
              <span className="mono [overflow-wrap:anywhere]">{fileName}</span>{" "}
              {held ? "changed nothing yet; it is set aside." : "is set aside and what its check did is undone:"}
            </DialogDescription>
          </DialogHeader>
          {!held && (
            <ul className="m-0 grid gap-1 pl-5 text-[13px]">
              <li>remarks it raised are removed;</li>
              <li>remarks it closed reopen;</li>
              <li>remarks it updated get their earlier text back.</li>
              <li className="muted">Remarks someone changed by hand since stay as they are.</li>
            </ul>
          )}
          {linkedSheetCode && (
            <p className="m-0 text-[13px]">
              The sheet code <span className="mono">{linkedSheetCode}</span> it gave the drawing is cleared too.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
            <Button variant="destructive" onClick={wrongFile} disabled={pending}>
              {pending ? "Saving…" : "Wrong file"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
