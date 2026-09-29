"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type ProjectOption = { id: string; code: string; name: string };
export type DisciplineOption = { id: string; name: string };
export type UserOption = { id: string; name: string; email: string };

export type DrawingFormValue = {
  projectId: string;
  code: string;
  name: string;
  disciplineId: string;
  ownerId: string;
  dueDate: string;
  /** Planned hours as typed; empty means no estimate. */
  estimatedHours: string;
};

export const SELECT_CLASS =
  "h-9 w-full min-w-0 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 text-[13px]";
export const TEXTAREA_CLASS =
  "min-h-[72px] w-full resize-y rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] p-2 text-[13px]";

/** "12,5" and "12.5" both work; `undefined` means the text is not a positive number. */
export function parseHours(text: string): number | null | undefined {
  const t = text.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function isDrawingFormComplete(v: DrawingFormValue) {
  return !!(v.projectId && v.code.trim() && v.name.trim() && v.disciplineId && v.ownerId)
    && parseHours(v.estimatedHours) !== undefined;
}

export function DrawingFormFields({
  idPrefix,
  value,
  onChange,
  projects,
  disciplines,
  users,
}: {
  idPrefix: string;
  value: DrawingFormValue;
  onChange: (next: DrawingFormValue) => void;
  projects: ProjectOption[];
  disciplines: DisciplineOption[];
  users: UserOption[];
}) {
  const set = <K extends keyof DrawingFormValue>(key: K, v: DrawingFormValue[K]) => onChange({ ...value, [key]: v });
  const id = (f: string) => `${idPrefix}-${f}`;

  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor={id("project")}>Project</Label>
        <select id={id("project")} className={SELECT_CLASS} value={value.projectId} onChange={e => set("projectId", e.target.value)}>
          <option value="">— Select project —</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-[140px_1fr] gap-3 max-[480px]:grid-cols-1">
        <div className="grid gap-1.5">
          <Label htmlFor={id("code")}>Code</Label>
          <Input id={id("code")} value={value.code} maxLength={64} placeholder="e.g. ELV-101" onChange={e => set("code", e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={id("name")}>Name</Label>
          <Input id={id("name")} value={value.name} maxLength={200} placeholder="e.g. Ground floor CCTV layout" onChange={e => set("name", e.target.value)} />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={id("discipline")}>Discipline</Label>
        <select id={id("discipline")} className={SELECT_CLASS} value={value.disciplineId} onChange={e => set("disciplineId", e.target.value)}>
          <option value="">— Select discipline —</option>
          {disciplines.map(d => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={id("owner")}>Owner</Label>
        <select id={id("owner")} className={SELECT_CLASS} value={value.ownerId} onChange={e => set("ownerId", e.target.value)}>
          <option value="">— Select owner —</option>
          {users.map(u => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor={id("due")}>Due date</Label>
          <Input id={id("due")} type="date" value={value.dueDate} onChange={e => set("dueDate", e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={id("estimate")}>Estimated hours</Label>
          <Input
            id={id("estimate")}
            inputMode="decimal"
            value={value.estimatedHours}
            placeholder="e.g. 16"
            aria-invalid={parseHours(value.estimatedHours) === undefined}
            onChange={e => set("estimatedHours", e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
