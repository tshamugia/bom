"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Icon } from "@/components/icons";
import { createBom } from "@/server/actions/boms";

export type NewBomProject = { id: string; code: string; name: string };

export function NewBomDialog({
  projectId,
  projects,
  open: openProp,
  onOpenChange,
}: {
  projectId?: string;
  projects?: NewBomProject[];
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
  const [name, setName] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  const showProjectPicker = !projectId && Array.isArray(projects);
  const effectiveProjectId = projectId ?? selectedProjectId;

  function reset() { setName(""); setSelectedProjectId(""); }

  const submit = () => {
    if (!effectiveProjectId) return;
    const targetProjectId = effectiveProjectId;
    start(async () => {
      try {
        const { bomId } = await createBom({ projectId: targetProjectId, name: name.trim() });
        toast.success("BOM created");
        setOpen(false);
        reset();
        router.push(`/builder/${targetProjectId}/${bomId}`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Create failed");
      }
    });
  };

  const blocked = !name.trim() || !effectiveProjectId;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => { setOpen(next); if (!next) reset(); }}
    >
      {!isControlled && (
        <DialogTrigger
          render={
            <Button>
              <Icon.Plus size={14} className="mr-1.5" /> New BOM
            </Button>
          }
        />
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New BOM</DialogTitle>
          <DialogDescription>
            A draft Rev A is created automatically inside the BOM.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          {showProjectPicker && (
            <div className="grid gap-1.5">
              <Label htmlFor="new-bom-project">Project</Label>
              <select
                id="new-bom-project"
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="h-9 w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 text-[13px]"
              >
                <option value="">— Select project —</option>
                {projects!.map((p) => (
                  <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="new-bom-name">BOM name</Label>
            <Input
              id="new-bom-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              placeholder="e.g. Foundation, Electrical, Mechanical"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && !blocked && !pending) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button onClick={submit} disabled={pending || blocked}>
            {pending ? "Creating…" : "Create BOM"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
