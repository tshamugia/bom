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
import { BOM_DELETE_REASON_MIN } from "@/lib/bom-status";
import { deleteBom } from "@/server/actions/boms";
import { TEXTAREA_CLASS } from "@/components/drawings/drawing-form-fields";

/** Admin-only. The reason is required and goes to the audit log. */
export function DeleteBomDialog({
  bomId,
  bomName,
  redirectTo,
  iconOnly = false,
}: {
  bomId: string;
  bomName: string;
  /** Where to go once the BOM is gone — the page showing it no longer exists. */
  redirectTo?: string;
  /** A small trash button for table rows. */
  iconOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const ready = reason.trim().length >= BOM_DELETE_REASON_MIN;

  const submit = () => {
    start(async () => {
      try {
        await deleteBom({ bomId, reason: reason.trim() });
      } catch (e) {
        toast.error(e instanceof Error && e.message ? e.message : "Delete failed");
        return;
      }
      toast.success(`${bomName} deleted`);
      setOpen(false);
      setReason("");
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        setOpen(next);
        if (!next) setReason("");
      }}
    >
      <DialogTrigger
        render={
          iconOnly
            ? <Button variant="ghost" size="sm" aria-label={`Delete ${bomName}`}><Icon.Trash size={14} /></Button>
            : <Button variant="ghost"><Icon.Trash size={14} /> Delete BOM</Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete BOM “{bomName}”?</DialogTitle>
          <DialogDescription>
            It disappears from the BOM Builder, the project and search. Nothing is erased: its revisions stay in the database, and the reason you give is kept in the audit log.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor={`delete-bom-reason-${bomId}`}>Reason</Label>
          <textarea
            id={`delete-bom-reason-${bomId}`}
            className={TEXTAREA_CLASS}
            value={reason}
            maxLength={1000}
            autoFocus
            onChange={e => setReason(e.target.value)}
            placeholder="e.g. Created by mistake — duplicate of Main BOM"
          />
          <p className="text-[12px] text-[var(--color-text-3)]">Required.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button variant="destructive" onClick={submit} disabled={pending || !ready}>
            {pending ? "Deleting…" : "Delete BOM"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
