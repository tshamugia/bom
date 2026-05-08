"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { renameBom } from "@/server/actions/boms";

export function RenameBomDialog({
  bomId,
  currentName,
  trigger,
  open: openProp,
  onOpenChange,
}: {
  bomId: string;
  currentName: string;
  trigger?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
}) {
  const isControlled = openProp !== undefined;
  const [openState, setOpenState] = useState(false);
  const open = isControlled ? !!openProp : openState;
  const setOpen = (next: boolean) => {
    if (!isControlled) setOpenState(next);
    onOpenChange?.(next);
  };
  const [name, setName] = useState(currentName);
  const [pending, start] = useTransition();
  const router = useRouter();

  const submit = () => {
    start(async () => {
      try {
        await renameBom({ bomId, name: name.trim() });
        toast.success("BOM renamed");
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Rename failed");
      }
    });
  };

  const blocked = !name.trim() || name.trim() === currentName;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => { setOpen(next); if (!next) setName(currentName); }}
    >
      {trigger ? <DialogTrigger render={trigger} /> : null}
      <DialogContent>
        <DialogHeader><DialogTitle>Rename BOM</DialogTitle></DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="rename-bom">BOM name</Label>
          <Input
            id="rename-bom"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && !blocked && !pending) { e.preventDefault(); submit(); }
            }}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button onClick={submit} disabled={pending || blocked}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
