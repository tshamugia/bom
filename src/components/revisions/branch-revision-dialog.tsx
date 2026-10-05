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
import { HelpTip } from "@/components/help/help-tip";
import { branchRevision } from "@/server/actions/revisions";

export type BomOwnerOption = { id: string; name: string };

const SELECT_CLASS =
  "h-9 w-full min-w-0 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 text-[13px]";

/**
 * Starts a draft copy of a committed revision. This is the only place a BOM's
 * owner can change — the new draft carries the chosen owner and the BOM follows.
 */
export function BranchRevisionDialog({
  variant,
  parentRevisionId,
  parentLetter,
  projectId,
  bomId,
  hasOpenDraft,
  owner,
  owners,
}: {
  /** `new` is the builder header's button, `clone` the small one in History. */
  variant: "new" | "clone";
  parentRevisionId: string;
  parentLetter: string;
  projectId: string;
  bomId: string;
  hasOpenDraft: boolean;
  owner: { id: string | null; name: string | null };
  /** Active editors — viewers can't own a BOM. */
  owners: BomOwnerOption[];
}) {
  const [open, setOpen] = useState(false);
  const [ownerId, setOwnerId] = useState(owner.id ?? "");
  const [pending, start] = useTransition();
  const router = useRouter();

  const options = owner.id && !owners.some(o => o.id === owner.id)
    ? [{ id: owner.id, name: `${owner.name ?? "Former user"} (current)` }, ...owners]
    : owners;
  const changed = ownerId !== "" && ownerId !== owner.id;
  const newOwnerName = owners.find(o => o.id === ownerId)?.name;

  const submit = () => {
    start(async () => {
      try {
        await branchRevision({ parentRevisionId, ownerId: changed ? ownerId : undefined });
        toast.success(changed ? `New revision created · owner ${newOwnerName}` : "New revision created");
        setOpen(false);
        router.push(`/builder/${projectId}/${bomId}`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't create the revision");
      }
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        setOpen(next);
        if (next) setOwnerId(owner.id ?? "");
      }}
    >
      <DialogTrigger
        render={variant === "new" ? (
          <Button
            disabled={hasOpenDraft}
            title={hasOpenDraft ? "A draft already exists for this BOM" : undefined}
          >
            New revision
          </Button>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={hasOpenDraft}
            title={hasOpenDraft ? "A draft already exists for this BOM" : `Clone Rev ${parentLetter} into a new draft`}
          >
            Clone
          </Button>
        )}
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{variant === "new" ? "New revision" : `Clone Rev ${parentLetter}`}</DialogTitle>
          <DialogDescription>
            Starts a draft copy of Rev {parentLetter} — its sections, lines and drawing links. Rev {parentLetter} stays as it is.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-1.5">
          <Label htmlFor={`branch-owner-${parentRevisionId}`} className="flex items-center gap-1.5">
            Owner <HelpTip topic="bom-revisions" />
          </Label>
          <select
            id={`branch-owner-${parentRevisionId}`}
            className={SELECT_CLASS}
            value={ownerId}
            onChange={e => setOwnerId(e.target.value)}
          >
            {!owner.id && <option value="">— Not set —</option>}
            {options.map(o => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
          <p className="text-[12px] text-[var(--color-text-3)]">
            {changed
              ? `The new revision and the BOM pass to ${newOwnerName}. Earlier revisions keep their owner.`
              : "A BOM's owner can only change together with a new revision — pick someone else here to hand it over."}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button onClick={submit} disabled={pending || hasOpenDraft}>
            {pending ? "Creating…" : changed ? "Create revision and change owner" : "Create revision"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
