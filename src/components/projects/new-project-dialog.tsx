"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Icon } from "@/components/icons";
import { createProject } from "@/server/actions/projects";

export function NewProjectDialog() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  function reset() {
    setCode("");
    setName("");
    setClient("");
  }

  const submit = () => {
    start(async () => {
      try {
        const project = await createProject({
          code: code.trim(),
          name: name.trim(),
          clientName: client.trim() || undefined,
        });
        toast.success("Project created");
        setOpen(false);
        reset();
        router.push(`/projects/${project.id}`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Create failed");
      }
    });
  };

  const blocked = !code.trim() || !name.trim();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger
        render={
          <button type="button" className="btn btn-primary">
            <Icon.Plus className="ico" /> New project
          </button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            Projects start empty. Fill in the passport and add BOMs and drawings from the project page.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="new-project-code">Project code</Label>
            <Input
              id="new-project-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={32}
              placeholder="e.g. ROV-24"
              autoFocus
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="new-project-name">Project name</Label>
            <Input
              id="new-project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Rover Mk II"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="new-project-client">Client (optional)</Label>
            <Input
              id="new-project-client"
              value={client}
              onChange={(e) => setClient(e.target.value)}
              maxLength={200}
              placeholder="e.g. Hilton Tbilisi"
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
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || blocked}>
            {pending ? "Creating…" : "Create project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
