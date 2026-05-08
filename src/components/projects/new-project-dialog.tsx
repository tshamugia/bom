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
import { createProject } from "@/server/actions/projects";

export function NewProjectDialog() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  function reset() {
    setCode("");
    setName("");
  }

  const submit = () => {
    start(async () => {
      try {
        const project = await createProject({
          code: code.trim(),
          name: name.trim(),
          quantity: 1,
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
          <Button>
            <Icon.Plus size={14} className="mr-1.5" /> New project
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            Projects start empty. Add one or more BOMs from the project page.
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
