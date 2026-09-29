"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/icons";
import { formatDate } from "@/lib/format";
import { daysBetween } from "@/lib/drawing-reminders";
import {
  addProjectMilestone, deleteProjectMilestone, setProjectMilestoneDone, updateProjectMilestone,
} from "@/server/actions/project-passport";
import type { ProjectMilestoneRow } from "@/server/queries/project-passport";

function DueBadge({ date, today, done }: { date: string; today: string; done: boolean }) {
  if (done) return <Badge tone="success">Done</Badge>;
  const left = daysBetween(today, date);
  if (left < 0) return <Badge tone="danger">{-left}d overdue</Badge>;
  if (left === 0) return <Badge tone="warning">Today</Badge>;
  return <Badge tone={left <= 14 ? "warning" : "gray"}>in {left}d</Badge>;
}

function MilestoneForm({
  initial,
  onSave,
  onCancel,
  pending,
  submitLabel,
}: {
  initial: { name: string; dueDate: string };
  onSave: (v: { name: string; dueDate: string }) => void;
  onCancel?: () => void;
  pending: boolean;
  submitLabel: string;
}) {
  const [name, setName] = useState(initial.name);
  const [dueDate, setDueDate] = useState(initial.dueDate);
  const ok = !!name.trim() && !!dueDate;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={name}
        maxLength={200}
        placeholder="e.g. Design submission"
        aria-label="Milestone"
        style={{ flex: "1 1 180px" }}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter" && ok && !pending) onSave({ name: name.trim(), dueDate });
        }}
      />
      <Input type="date" value={dueDate} aria-label="Date" style={{ width: 150 }} onChange={e => setDueDate(e.target.value)} />
      {onCancel && <Button size="sm" variant="outline" onClick={onCancel} disabled={pending}>Cancel</Button>}
      <Button size="sm" onClick={() => onSave({ name: name.trim(), dueDate })} disabled={pending || !ok}>
        {submitLabel}
      </Button>
    </div>
  );
}

function MilestoneRow({ m, today, readOnly }: { m: ProjectMilestoneRow; today: string; readOnly: boolean }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const done = !!m.doneAt;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error ?? "Something went wrong");
        return;
      }
      setEditing(false);
      router.refresh();
    });

  if (editing) {
    return (
      <div className="px-4 py-2.5" style={{ borderTop: "1px solid var(--line-soft)" }}>
        <MilestoneForm
          initial={{ name: m.name, dueDate: m.dueDate }}
          pending={pending}
          submitLabel="Save"
          onCancel={() => setEditing(false)}
          onSave={v => run(() => updateProjectMilestone({ id: m.id, ...v }))}
        />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2" style={{ borderTop: "1px solid var(--line-soft)" }}>
      {!readOnly && (
        <input
          type="checkbox"
          checked={done}
          disabled={pending}
          aria-label={done ? `Mark ${m.name} as not reached` : `Mark ${m.name} as reached`}
          onChange={e => run(() => setProjectMilestoneDone({ id: m.id, done: e.target.checked }))}
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-[13px]" style={done ? { textDecoration: "line-through", color: "var(--text-3)" } : undefined}>{m.name}</div>
        <div className="muted text-[11.5px]">{formatDate(m.dueDate)}</div>
      </div>
      <DueBadge date={m.dueDate} today={today} done={done} />
      {!readOnly && (
        <div className="row-actions" style={{ opacity: 1 }}>
          <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label={`Edit ${m.name}`} onClick={() => setEditing(true)}>
            <Icon.Edit className="ico" />
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm btn-icon"
            aria-label={`Remove ${m.name}`}
            disabled={pending}
            onClick={() => run(() => deleteProjectMilestone({ id: m.id }))}
          >
            <Icon.Trash className="ico" />
          </button>
        </div>
      )}
    </div>
  );
}

/** Start and completion come from the passport; milestones are the key dates in between. */
export function MilestonesCard({
  projectId,
  startDate,
  targetDate,
  milestones,
  today,
  readOnly = false,
}: {
  projectId: string;
  startDate: string | null;
  targetDate: string | null;
  milestones: ProjectMilestoneRow[];
  today: string;
  readOnly?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const open = milestones.filter(m => !m.doneAt).length;

  const add = (v: { name: string; dueDate: string }) =>
    start(async () => {
      const res = await addProjectMilestone({ projectId, ...v });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setAdding(false);
      router.refresh();
    });

  return (
    <div className="card" style={{ minWidth: 0 }}>
      <div className="card-head">
        <div>
          <h3 className="card-title">Key dates</h3>
          <p className="card-sub">Start, completion and the milestones in between.</p>
        </div>
        <span className="spacer" />
        {open > 0 && <span className="pill tabular">{open} open</span>}
        {!adding && !readOnly && (
          <button type="button" className="btn btn-sm" onClick={() => setAdding(true)}>
            <Icon.Plus className="ico" /> Add
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 px-4 py-3 text-[12.5px]">
        <div>
          <div className="field-label">Start</div>
          <div className="mt-0.5">{startDate ? formatDate(startDate) : <span className="muted">Not set</span>}</div>
        </div>
        <div>
          <div className="field-label">Completion</div>
          <div className="mt-0.5 flex items-center gap-2">
            {targetDate ? (
              <>
                {formatDate(targetDate)} <DueBadge date={targetDate} today={today} done={false} />
              </>
            ) : (
              <span className="muted">Not set</span>
            )}
          </div>
        </div>
      </div>
      {adding && (
        <div className="px-4 pb-3">
          <MilestoneForm initial={{ name: "", dueDate: "" }} pending={pending} submitLabel="Add" onCancel={() => setAdding(false)} onSave={add} />
        </div>
      )}
      {milestones.map(m => <MilestoneRow key={m.id} m={m} today={today} readOnly={readOnly} />)}
      {milestones.length === 0 && !adding && (
        <div className="muted px-4 py-2.5 text-[12.5px]" style={{ borderTop: "1px solid var(--line-soft)" }}>
          {readOnly ? "No milestones yet." : "No milestones yet — add design submission, installation, handover…"}
        </div>
      )}
    </div>
  );
}
