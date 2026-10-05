"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BlockedNote } from "@/components/help/blocked-note";
import { CodeField } from "@/components/master/code-field";

export type ProjectOption = { id: string; code: string; name: string };
export type DisciplineOption = { id: string; name: string };
export type UserOption = { id: string; name: string; email: string };

/** No code: the server makes it from the name (`src/lib/codes.ts`); the form only shows it. */
export type DrawingFormValue = {
  projectId: string;
  name: string;
  disciplineId: string;
  ownerId: string;
  dueDate: string;
  /** Planned hours as typed; empty means no estimate. */
  estimatedHours: string;
  /** Folder on the company file server; empty means not set. */
  fileLocation: string;
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
  return !!(v.projectId && v.name.trim() && v.disciplineId && v.ownerId)
    && parseHours(v.estimatedHours) !== undefined;
}

export function DrawingFormFields({
  idPrefix,
  value,
  code,
  onChange,
  projects,
  disciplines,
  users,
}: {
  idPrefix: string;
  value: DrawingFormValue;
  /** The code to show and why it can't be typed. */
  code: { value: string; loading: boolean; note: React.ReactNode };
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
      <div className="grid grid-cols-[1fr_140px] gap-3 max-[480px]:grid-cols-1">
        <div className="grid gap-1.5">
          <Label htmlFor={id("name")}>Name</Label>
          <Input id={id("name")} value={value.name} maxLength={200} placeholder="e.g. Ground floor CCTV layout" onChange={e => set("name", e.target.value)} />
        </div>
        <CodeField id={id("code")} value={code.value} loading={code.loading} />
      </div>
      <BlockedNote icon="lock">{code.note}</BlockedNote>
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
      <div className="grid gap-1.5">
        <Label htmlFor={id("location")}>
          File location <span className="text-[var(--color-text-3)]">(optional)</span>
        </Label>
        <Input
          id={id("location")}
          className="font-mono"
          value={value.fileLocation}
          maxLength={500}
          placeholder="e.g. 2026/BMW/CCTV"
          onChange={e => set("fileLocation", e.target.value)}
        />
        <p className="text-[12px] text-[var(--color-text-3)]">The folder on the file server where the drawing files are kept.</p>
      </div>
    </div>
  );
}
