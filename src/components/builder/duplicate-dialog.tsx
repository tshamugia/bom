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
import { duplicateBom } from "@/server/actions/boms";

type ProjectOption = { id: string; code: string; name: string };

type Props = {
  sourceBomId: string;
  sourceBomName: string;
  sourceProjectId: string;
  sourceRevisionId: string;
  projects: ProjectOption[];
};

export function DuplicateDialog({ sourceBomId, sourceBomName, sourceProjectId, sourceRevisionId, projects }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(`${sourceBomName} (Copy)`);
  const [targetProjectId, setTargetProjectId] = useState(sourceProjectId);
  const [pending, start] = useTransition();
  const router = useRouter();

  const submit = () => {
    start(async () => {
      try {
        const { bomId } = await duplicateBom({
          sourceBomId,
          sourceRevisionId,
          targetProjectId,
          name: name.trim(),
        });
        toast.success("BOM duplicated");
        setOpen(false);
        router.push(`/builder/${targetProjectId}/${bomId}`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Duplicate failed");
      }
    });
  };

  const blocked = !name.trim();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline">
            <Icon.Copy size={14} className="mr-1.5" /> Duplicate
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Duplicate BOM</DialogTitle>
          <DialogDescription>
            Creates a new BOM seeded with a copy of this revision&apos;s sections and lines as a fresh draft (Rev A).
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="duplicate-target-project">Destination project</Label>
            <select
              id="duplicate-target-project"
              value={targetProjectId}
              onChange={e => setTargetProjectId(e.target.value)}
              className="h-9 w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 text-[13px]"
            >
              {projects.length === 0 ? (
                <option value={sourceProjectId}>Current project</option>
              ) : (
                projects.map(p => (
                  <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
                ))
              )}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="duplicate-name">BOM name</Label>
            <Input id="duplicate-name" value={name} onChange={e => setName(e.target.value)} maxLength={200} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button onClick={submit} disabled={pending || blocked}>
            {pending ? "Duplicating..." : "Duplicate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
