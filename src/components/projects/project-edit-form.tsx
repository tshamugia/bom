"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProject, softDeleteProject } from "@/server/actions/projects";

type Project = {
  id: string;
  code: string;
  name: string;
  quantity: number;
  targetDate: string | null;
  ownerId: string | null;
};

type Owner = { id: string; name: string; email: string };

export function ProjectEditForm({ project, owners }: { project: Project; owners: Owner[] }) {
  const router = useRouter();
  const [code, setCode] = useState(project.code);
  const [name, setName] = useState(project.name);
  const [qty, setQty] = useState(project.quantity);
  const [deadline, setDeadline] = useState(project.targetDate ?? "");
  const [ownerId, setOwnerId] = useState(project.ownerId ?? "");
  const [pending, start] = useTransition();
  const [archiving, startArchive] = useTransition();

  return (
    <div className="max-w-xl rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-card)]">
      <div className="space-y-3">
        <div className="space-y-1.5"><Label htmlFor="edit-code">Code</Label><Input id="edit-code" value={code} onChange={e => setCode(e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="edit-name">Name</Label><Input id="edit-name" value={name} onChange={e => setName(e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="edit-qty">Build quantity</Label><Input id="edit-qty" type="number" min={1} value={qty} onChange={e => setQty(Number(e.target.value))} /></div>
        <div className="space-y-1.5"><Label htmlFor="edit-deadline">Due date</Label><Input id="edit-deadline" type="date" value={deadline} onChange={e => setDeadline(e.target.value)} /></div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-owner">Owner</Label>
          <select
            id="edit-owner"
            value={ownerId}
            onChange={e => setOwnerId(e.target.value)}
            className="h-9 w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 text-[13px]"
          >
            <option value="">— Unassigned —</option>
            {owners.map(o => (
              <option key={o.id} value={o.id}>{o.name} ({o.email})</option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-5 flex items-center justify-between gap-2">
        <Button
          variant="outline"
          disabled={archiving}
          onClick={() => {
            if (!confirm(`Archive project ${project.code}? It will be hidden from lists but kept in history.`)) return;
            startArchive(async () => {
              try {
                await softDeleteProject({ id: project.id });
                toast.success(`${project.code} archived`);
                router.push("/projects");
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Archive failed");
              }
            });
          }}
        >
          {archiving ? "Archiving…" : "Archive project"}
        </Button>
        <Button
          disabled={pending || !code || !name}
          onClick={() => start(async () => {
            try {
              await updateProject({
                id: project.id,
                code, name,
                quantity: qty,
                targetDate: deadline ? deadline : null,
                ownerId: ownerId ? ownerId : null,
              });
              toast.success("Project saved");
              router.refresh();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Save failed");
            }
          })}
        >
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
