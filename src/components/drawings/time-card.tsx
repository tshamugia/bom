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
import { formatDate } from "@/lib/format";
import { formatHours, hoursVariancePct } from "@/lib/drawing-meta";
import { formatDrawingRevision, todayIso } from "@/lib/drawing-status";
import { deleteDrawingTime, logDrawingTime } from "@/server/actions/drawing-time";
import type { TimeEntryRow } from "@/server/queries/drawing-control";
import { SELECT_CLASS, TEXTAREA_CLASS, parseHours } from "./drawing-form-fields";

export type RevisionOption = { id: string; number: number };

function LogTimeDialog({ revisions }: { revisions: RevisionOption[] }) {
  const latest = revisions[0];
  const [open, setOpen] = useState(false);
  const [revisionId, setRevisionId] = useState(latest?.id ?? "");
  const [hours, setHours] = useState("");
  const [workDate, setWorkDate] = useState(todayIso);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  const parsed = parseHours(hours);
  const valid = typeof parsed === "number" && parsed <= 24 && !!workDate && !!revisionId;

  const submit = () => {
    if (typeof parsed !== "number") return;
    start(async () => {
      const res = await logDrawingTime({ revisionId, hours: parsed, workDate, note: note.trim() || undefined });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${formatHours(parsed)} logged`);
      setOpen(false);
      setHours("");
      setNote("");
      router.refresh();
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        setOpen(next);
        if (next) {
          setRevisionId(latest?.id ?? "");
          setWorkDate(todayIso());
        }
      }}
    >
      <DialogTrigger
        render={
          <button type="button" className="btn btn-sm">
            <Icon.Plus className="ico" /> Log time
          </button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log time</DialogTitle>
          <DialogDescription>Hours you spent on this drawing. They add up against the estimate.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-[90px_1fr_100px] gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="time-hours">Hours</Label>
              <Input
                id="time-hours"
                inputMode="decimal"
                value={hours}
                placeholder="e.g. 3.5"
                autoFocus
                aria-invalid={!!hours && !valid}
                onChange={e => setHours(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="time-date">Date</Label>
              <Input id="time-date" type="date" max={todayIso()} value={workDate} onChange={e => setWorkDate(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="time-rev">Revision</Label>
              <select id="time-rev" className={SELECT_CLASS} value={revisionId} onChange={e => setRevisionId(e.target.value)}>
                {revisions.map(r => (
                  <option key={r.id} value={r.id}>{formatDrawingRevision(r.number)}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="time-note">Note (optional)</Label>
            <textarea
              id="time-note"
              className={TEXTAREA_CLASS}
              value={note}
              maxLength={500}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. Cable routing on level 2"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button onClick={submit} disabled={pending || !valid}>{pending ? "Saving…" : "Log time"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteEntryButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm btn-icon"
      aria-label="Remove entry"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await deleteDrawingTime({ id });
          if (!res.ok) toast.error(res.error);
          else router.refresh();
        })
      }
    >
      <Icon.Trash className="ico" />
    </button>
  );
}

export function TimeCard({
  estimatedHours,
  entries,
  revisions,
  currentUserId,
  canManageAll,
  readOnly = false,
}: {
  estimatedHours: number | null;
  entries: TimeEntryRow[];
  /** Newest first. */
  revisions: RevisionOption[];
  currentUserId: string;
  canManageAll: boolean;
  readOnly?: boolean;
}) {
  const logged = entries.reduce((s, e) => s + e.hours, 0);
  const variance = hoursVariancePct(logged, estimatedHours);
  const over = variance !== null && variance > 0;
  const pct = estimatedHours ? Math.min(100, Math.round((logged / estimatedHours) * 100)) : 0;

  const perRevision = revisions
    .map(r => ({ ...r, hours: entries.filter(e => e.revisionId === r.id).reduce((s, e) => s + e.hours, 0) }))
    .filter(r => r.hours > 0);

  return (
    <div className="card">
      <div className="card-head">
        <h3 className="card-title">Time</h3>
        <span className="spacer" />
        {!readOnly && <LogTimeDialog revisions={revisions} />}
      </div>
      <div className="grid gap-3 p-4">
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[12.5px]">
          <span><span className="muted">Estimated</span> <strong className="tabular">{formatHours(estimatedHours)}</strong></span>
          <span><span className="muted">Logged</span> <strong className="tabular">{formatHours(logged)}</strong></span>
          {variance !== null && (
            <span style={{ color: over ? "var(--red)" : "var(--green)", fontWeight: 600 }}>
              {over ? `+${variance}% over estimate` : `${100 + variance}% of estimate`}
            </span>
          )}
        </div>
        {estimatedHours ? (
          <div
            className="h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-3)]"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Logged hours against the estimate"
          >
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: over ? "var(--red)" : "var(--accent)" }} />
          </div>
        ) : (
          <p className="muted m-0 text-[12px]">{readOnly ? "No estimate yet." : "No estimate yet — set one with Edit."}</p>
        )}
        {perRevision.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {perRevision.map(r => (
              <span key={r.id} className="pill">
                <span className="mono">{formatDrawingRevision(r.number)}</span> {formatHours(r.hours)}
              </span>
            ))}
          </div>
        )}
      </div>
      {entries.length > 0 && (
        <div className="table-wrap" style={{ borderTop: "1px solid var(--line-soft)", maxHeight: 280 }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Date</th>
                <th>Engineer</th>
                <th>Rev</th>
                <th className="num">Hours</th>
                {!readOnly && <th />}
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{formatDate(e.workDate)}</td>
                  <td>
                    {e.userName ?? "—"}
                    {e.note && <div className="muted" style={{ fontSize: 11.5 }}>{e.note}</div>}
                  </td>
                  <td className="mono muted">{formatDrawingRevision(e.revisionNumber)}</td>
                  <td className="num">{formatHours(e.hours)}</td>
                  {!readOnly && (
                    <td style={{ width: 40 }}>
                      {(canManageAll || e.userId === currentUserId) && (
                        <div className="row-actions"><DeleteEntryButton id={e.id} /></div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
