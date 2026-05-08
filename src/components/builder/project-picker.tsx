"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Icon } from "@/components/icons";
import { createProject } from "@/server/actions/projects";

export type OwnerCandidate = { id: string; name: string; email: string };

export function ProjectCreateButton({ owners = [] }: { owners?: OwnerCandidate[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [qty, setQty] = useState(1);
  const [deadline, setDeadline] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [pending, start] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button><Icon.Plus size={14} className="mr-1.5" /> New project</Button>} />
      <DialogContent>
        <DialogHeader><DialogTitle>New project</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label htmlFor="project-code">Code</Label><Input id="project-code" value={code} onChange={e => setCode(e.target.value)} placeholder="NB-2412" /></div>
          <div className="space-y-1.5"><Label htmlFor="project-name">Name</Label><Input id="project-name" value={name} onChange={e => setName(e.target.value)} placeholder="Northstar Beacon v3.2" /></div>
          <div className="space-y-1.5"><Label htmlFor="project-quantity">Build quantity</Label><Input id="project-quantity" type="number" value={qty} min={1} onChange={e => setQty(Number(e.target.value))} /></div>
          <div className="space-y-1.5"><Label htmlFor="project-deadline">Deadline</Label><Input id="project-deadline" type="date" value={deadline} onChange={e => setDeadline(e.target.value)} /></div>
          {owners.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="project-owner">Owner</Label>
              <select
                id="project-owner"
                value={ownerId}
                onChange={e => setOwnerId(e.target.value)}
                className="h-9 w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 text-[13px]"
              >
                <option value="">— Assign to me —</option>
                {owners.map(o => (
                  <option key={o.id} value={o.id}>{o.name} ({o.email})</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={pending || !code || !name}
            onClick={() => start(async () => {
              const p = await createProject({
                code, name, quantity: qty,
                targetDate: deadline || undefined,
                ownerId: ownerId || undefined,
              });
              setOpen(false);
              router.push(`/projects/${p.id}`);
              router.refresh();
            })}
          >
            {pending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
