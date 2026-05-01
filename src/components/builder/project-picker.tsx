"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Icon } from "@/components/icons";
import { createProject } from "@/server/actions/projects";

export function ProjectCreateButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [qty, setQty] = useState(1);
  const [pending, start] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button><Icon.Plus size={14} className="mr-1.5" /> New BOM</Button>} />
      <DialogContent>
        <DialogHeader><DialogTitle>New project</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label htmlFor="project-code">Code</Label><Input id="project-code" value={code} onChange={e => setCode(e.target.value)} placeholder="NB-2412" /></div>
          <div className="space-y-1.5"><Label htmlFor="project-name">Name</Label><Input id="project-name" value={name} onChange={e => setName(e.target.value)} placeholder="Northstar Beacon v3.2" /></div>
          <div className="space-y-1.5"><Label htmlFor="project-quantity">Build quantity</Label><Input id="project-quantity" type="number" value={qty} min={1} onChange={e => setQty(Number(e.target.value))} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={pending || !code || !name}
            onClick={() => start(async () => {
              const p = await createProject({ code, name, quantity: qty });
              setOpen(false);
              router.push(`/builder/${p.id}`);
            })}
          >
            {pending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
