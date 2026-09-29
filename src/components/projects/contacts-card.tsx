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
import { addProjectContact, deleteProjectContact, updateProjectContact } from "@/server/actions/project-passport";
import type { ProjectContactRow } from "@/server/queries/project-passport";

type ContactValue = { name: string; role: string; company: string; phone: string; email: string };

const EMPTY: ContactValue = { name: "", role: "", company: "", phone: "", email: "" };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ContactDialog({
  projectId,
  contact,
  trigger,
}: {
  projectId: string;
  /** Omit to add a new contact. */
  contact?: ProjectContactRow;
  trigger: React.ReactElement;
}) {
  const initial: ContactValue = contact
    ? {
        name: contact.name,
        role: contact.role ?? "",
        company: contact.company ?? "",
        phone: contact.phone ?? "",
        email: contact.email ?? "",
      }
    : EMPTY;
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(initial);
  const [pending, start] = useTransition();
  const router = useRouter();
  const set = (k: keyof ContactValue, value: string) => setV(prev => ({ ...prev, [k]: value }));
  const emailBad = !!v.email.trim() && !EMAIL_RE.test(v.email.trim());

  const save = () =>
    start(async () => {
      const fields = {
        name: v.name,
        role: v.role || null,
        company: v.company || null,
        phone: v.phone || null,
        email: v.email.trim() || null,
      };
      const res = contact
        ? await updateProjectContact({ id: contact.id, ...fields })
        : await addProjectContact({ projectId, ...fields });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(contact ? "Contact saved" : "Contact added");
      setOpen(false);
      router.refresh();
    });

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        setOpen(next);
        if (next) setV(initial);
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{contact ? "Edit contact" : "Add contact"}</DialogTitle>
          <DialogDescription>Client, consultant, contractor or site people for this project.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="pc-name">Name</Label>
            <Input id="pc-name" value={v.name} maxLength={200} autoFocus onChange={e => set("name", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="pc-role">Role</Label>
              <Input id="pc-role" value={v.role} maxLength={100} placeholder="e.g. Client PM, Site foreman" onChange={e => set("role", e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pc-company">Company</Label>
              <Input id="pc-company" value={v.company} maxLength={200} onChange={e => set("company", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="pc-phone">Phone</Label>
              <Input id="pc-phone" type="tel" value={v.phone} maxLength={50} placeholder="+995 5xx xx xx xx" onChange={e => set("phone", e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pc-email">Email</Label>
              <Input id="pc-email" type="email" value={v.email} maxLength={200} aria-invalid={emailBad} onChange={e => set("email", e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button onClick={save} disabled={pending || !v.name.trim() || emailBad}>{pending ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RemoveContact({ contact }: { contact: ProjectContactRow }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm btn-icon"
      aria-label={`Remove ${contact.name}`}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await deleteProjectContact({ id: contact.id });
          if (!res.ok) toast.error(res.error);
          else router.refresh();
        })
      }
    >
      <Icon.Trash className="ico" />
    </button>
  );
}

export function ContactsCard({
  projectId,
  contacts,
  readOnly = false,
}: {
  projectId: string;
  contacts: ProjectContactRow[];
  readOnly?: boolean;
}) {
  return (
    <div className="card" style={{ minWidth: 0 }}>
      <div className="card-head">
        <div>
          <h3 className="card-title">Contacts</h3>
          <p className="card-sub">Who to call about this project.</p>
        </div>
        <span className="spacer" />
        {!readOnly && (
          <ContactDialog
            projectId={projectId}
            trigger={<button type="button" className="btn btn-sm"><Icon.Plus className="ico" /> Add</button>}
          />
        )}
      </div>
      {contacts.length === 0 && <div className="muted px-4 py-3 text-[12.5px]">No contacts yet.</div>}
      {contacts.map((c, i) => (
        <div
          key={c.id}
          className="group flex items-start gap-3 px-4 py-2.5"
          style={{ borderTop: i === 0 ? undefined : "1px solid var(--line-soft)" }}
        >
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium">{c.name}</div>
            {(c.role || c.company) && (
              <div className="muted text-[12px]">{[c.role, c.company].filter(Boolean).join(" · ")}</div>
            )}
            <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[12.5px]">
              {c.phone && (
                <a href={`tel:${c.phone.replace(/\s+/g, "")}`} className="inline-flex items-center gap-1 hover:underline">
                  {c.phone}
                </a>
              )}
              {c.email && (
                <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 hover:underline">
                  <Icon.Mail size={12} /> {c.email}
                </a>
              )}
            </div>
          </div>
          {!readOnly && (
            <div className="row-actions" style={{ opacity: 1 }}>
              <ContactDialog
                projectId={projectId}
                contact={c}
                trigger={<button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label={`Edit ${c.name}`}><Icon.Edit className="ico" /></button>}
              />
              <RemoveContact contact={c} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
