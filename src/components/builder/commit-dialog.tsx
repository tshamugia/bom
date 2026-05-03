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
import { commitRevision } from "@/server/actions/revisions";

type Props = {
  revisionId: string;
  letter: string;
  lineCount: number;
  vendorCount: number;
  hasZeroQty: boolean;
};

export function CommitDialog({ revisionId, letter, lineCount, vendorCount, hasZeroQty }: Props) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const blocked = lineCount === 0 || hasZeroQty;

  const submit = () => {
    start(async () => {
      try {
        await commitRevision({ revisionId, commitMessage: message.trim() || undefined });
        toast.success(`Rev ${letter} committed`);
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Commit failed");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button>Commit revision</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Commit Rev {letter}</DialogTitle>
          <DialogDescription>
            Locks the revision. After commit the lines are read-only and the revision becomes procurement-eligible.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md bg-[var(--color-surface-2)] p-3 text-[12px]">
          <div className={lineCount > 0 ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}>
            {lineCount > 0 ? "✓" : "✗"} {lineCount} line{lineCount === 1 ? "" : "s"} · {vendorCount} vendor{vendorCount === 1 ? "" : "s"}
          </div>
          <div className={hasZeroQty ? "text-[var(--color-danger)]" : "text-[var(--color-success)]"}>
            {hasZeroQty ? "✗ Some lines have zero quantity" : "✓ No empty quantities"}
          </div>
        </div>

        <div className="mt-3 grid gap-1.5">
          <Label htmlFor="commit-message">Commit message <span className="text-[var(--color-text-3)]">(optional)</span></Label>
          <textarea
            id="commit-message"
            className="min-h-[72px] resize-y rounded-md border border-[var(--color-line)] p-2 text-[13px]"
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="What changed in this revision?"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button onClick={submit} disabled={pending || blocked}>Commit Rev {letter}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
