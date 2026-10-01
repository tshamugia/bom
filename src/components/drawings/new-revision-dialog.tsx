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
import { formatDrawingRevision } from "@/lib/drawing-status";
import { createDrawingRevision } from "@/server/actions/drawings";
import { TEXTAREA_CLASS } from "./drawing-form-fields";

function BomImpactOption({
  checked,
  onSelect,
  title,
  hint,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  hint: string;
}) {
  return (
    <label
      className="flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-2 text-[12.5px]"
      style={{ borderColor: checked ? "var(--color-accent)" : "var(--color-line)" }}
    >
      <input type="radio" name="bom-impact" className="mt-0.5" checked={checked} onChange={onSelect} />
      <span className="grid gap-0.5">
        <span className="font-medium">{title}</span>
        <span className="muted">{hint}</span>
      </span>
    </label>
  );
}

export function NewRevisionDialog({
  drawingId,
  currentNumber,
}: {
  drawingId: string;
  currentNumber: number;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [bomImpact, setBomImpact] = useState(true);
  const [pending, start] = useTransition();
  const router = useRouter();
  const current = formatDrawingRevision(currentNumber);
  const next = formatDrawingRevision(currentNumber + 1);

  const submit = () => {
    start(async () => {
      const res = await createDrawingRevision({ drawingId, commitMessage: message.trim(), bomImpact });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${formatDrawingRevision(res.number)} created`);
      setOpen(false);
      setMessage("");
      setBomImpact(true);
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

        <fieldset className="grid gap-1.5">
          <legend className="field-label mb-1.5 flex items-center gap-1.5">
            Does this change the BOM? <HelpTip topic="bom-impact" />
          </legend>
          <BomImpactOption
            checked={bomImpact}
            onSelect={() => setBomImpact(true)}
            title="Yes — quantities or items change"
            hint="BOMs built from an earlier revision show as outdated."
          />
          <BomImpactOption
            checked={!bomImpact}
            onSelect={() => setBomImpact(false)}
            title="No BOM change"
            hint="Layout, annotations, title block… BOMs built from earlier revisions stay current."
          />
        </fieldset>

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
