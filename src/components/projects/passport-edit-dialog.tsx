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
import { SELECT_CLASS, TEXTAREA_CLASS, type UserOption } from "@/components/drawings/drawing-form-fields";
import { saveProjectPassport } from "@/server/actions/project-passport";
import { softDeleteProject } from "@/server/actions/projects";

export type PassportValue = {
  code: string;
  name: string;
  ownerId: string;
  clientName: string;
  contractNo: string;
  siteAddress: string;
  description: string;
  startDate: string;
  targetDate: string;
};

export function PassportEditDialog({
  projectId,
  initial,
  users,
  canDelete,
}: {
  projectId: string;
  initial: PassportValue;
  users: UserOption[];
  /** Archiving a project is admin-only. */
  canDelete: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(initial);
  const [pending, start] = useTransition();
  const [archiving, startArchive] = useTransition();
  const router = useRouter();

  const set = <K extends keyof PassportValue>(k: K, value: PassportValue[K]) => setV(prev => ({ ...prev, [k]: value }));
  const datesWrong = !!v.startDate && !!v.targetDate && v.startDate > v.targetDate;
  const blocked = !v.code.trim() || !v.name.trim() || datesWrong;

  const save = () =>
    start(async () => {
      const res = await saveProjectPassport({
        id: projectId,
        code: v.code,
        name: v.name,
        ownerId: v.ownerId || null,
        clientName: v.clientName,
        contractNo: v.contractNo,
        siteAddress: v.siteAddress,
        description: v.description,
        startDate: v.startDate || null,
        targetDate: v.targetDate || null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Project passport saved");
      setOpen(false);
      router.refresh();
    });

  const archive = () => {
    if (!confirm(`Archive project ${initial.code}? It will be hidden from lists but kept in history.`)) return;
    startArchive(async () => {
      try {
        await softDeleteProject({ id: projectId });
        toast.success(`${initial.code} archived`);
        router.push("/projects");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Archive failed");
      }
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        setOpen(next);
        if (next) setV(initial);
      }}
    >
      <DialogTrigger
        render={
          <button type="button" className="btn btn-sm">
            <Icon.Edit className="ico" /> Edit
          </button>
        }
      />
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Project passport</DialogTitle>
          <DialogDescription>Who the project is for, where, under which contract and by when.</DialogDescription>
        </DialogHeader>

        <div className="grid max-h-[65vh] gap-3 overflow-y-auto pr-1">
          <div className="grid grid-cols-[140px_1fr] gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="pp-code">Code</Label>
              <Input id="pp-code" value={v.code} maxLength={32} onChange={e => set("code", e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pp-name">Project name</Label>
              <Input id="pp-name" value={v.name} maxLength={200} onChange={e => set("name", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="pp-client">Client</Label>
              <Input id="pp-client" value={v.clientName} maxLength={200} placeholder="e.g. Hilton Tbilisi" onChange={e => set("clientName", e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pp-contract">Contract no.</Label>
              <Input id="pp-contract" value={v.contractNo} maxLength={100} placeholder="e.g. INS-2026/041" onChange={e => set("contractNo", e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pp-site">Site address</Label>
            <Input id="pp-site" value={v.siteAddress} maxLength={300} placeholder="e.g. 12 Rustaveli Ave, Tbilisi" onChange={e => set("siteAddress", e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pp-owner">Project manager</Label>
            <select id="pp-owner" className={SELECT_CLASS} value={v.ownerId} onChange={e => set("ownerId", e.target.value)}>
              <option value="">— Unassigned —</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="pp-start">Start date</Label>
              <Input id="pp-start" type="date" value={v.startDate} onChange={e => set("startDate", e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pp-target">Completion date</Label>
              <Input
                id="pp-target"
                type="date"
                value={v.targetDate}
                aria-invalid={datesWrong}
                onChange={e => set("targetDate", e.target.value)}
              />
            </div>
          </div>
          {datesWrong && <p className="m-0 text-[12px]" style={{ color: "var(--red)" }}>The start date is after the completion date.</p>}
          <div className="grid gap-1.5">
            <Label htmlFor="pp-desc">Scope / notes</Label>
            <textarea
              id="pp-desc"
              className={TEXTAREA_CLASS}
              value={v.description}
              maxLength={4000}
              placeholder="e.g. ELV systems for the hotel: CCTV, access control, fire alarm"
              onChange={e => set("description", e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          {canDelete ? (
            <Button variant="outline" onClick={archive} disabled={archiving || pending}>
              {archiving ? "Archiving…" : "Archive project"}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
            <Button onClick={save} disabled={pending || blocked}>{pending ? "Saving…" : "Save"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
