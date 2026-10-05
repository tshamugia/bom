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
import { BlockedNote } from "@/components/help/blocked-note";
import { CodeField, useSuggestedCode } from "@/components/master/code-field";
import { createProject, suggestProjectCode } from "@/server/actions/projects";

export function NewProjectDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  const suggested = useSuggestedCode(suggestProjectCode, open && name.trim() ? { name: name.trim() } : null);

  function reset() {
    setName("");
    setClient("");
  }

  const submit = () => {
    start(async () => {
      try {
        const project = await createProject({
          name: name.trim(),
          clientName: client.trim() || undefined,
        });
        toast.success(`${project.code} created`);
        setOpen(false);
        reset();
        router.push(`/projects/${project.id}`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Create failed");
      }
    });
  };

  const blocked = !name.trim();

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
          <div className="grid grid-cols-[1fr_140px] gap-3 max-[480px]:grid-cols-1">
            <div className="grid gap-1.5">
              <Label htmlFor="new-project-name">Project name</Label>
              <Input
                id="new-project-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={200}
                placeholder="e.g. BMW showroom"
                autoFocus
              />
            </div>
            <CodeField id="new-project-code" label="Project code" value={suggested.code} loading={suggested.loading} />
          </div>
          <BlockedNote icon="lock">
            The code is made from the name — its initials and the next free number — and doesn&apos;t change later.
          </BlockedNote>
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
