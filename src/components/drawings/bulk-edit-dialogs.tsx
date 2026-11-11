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
import { HelpTip } from "@/components/help/help-tip";
import { BlockedNote } from "@/components/help/blocked-note";
import { DRAWING_STATUSES, DRAWING_STATUS_LABEL, todayIso, type DrawingStatus } from "@/lib/drawing-status";
import {
  SHARED_BLOCK_MESSAGE,
  planBulkDueDate, planBulkOwner, planBulkStatus, sharedRemarkBlock, sharedTimeBlock,
  type BulkDrawing, type BulkSkip,
} from "@/lib/drawing-bulk";
import { MANUAL_REMARK_SOURCES, MAX_ENTRY_HOURS, REMARK_SOURCE_LABEL, formatHours } from "@/lib/drawing-meta";
import { formatDate } from "@/lib/format";
import {
  bulkChangeDrawingStatus, bulkSetDrawingDueDate, bulkSetDrawingOwner,
  type BulkDrawingResult,
} from "@/server/actions/drawings";
import { addSharedDrawingRemark, logSharedDrawingTime } from "@/server/actions/drawing-shared";
import { SELECT_CLASS, TEXTAREA_CLASS, parseHours, type UserOption } from "./drawing-form-fields";
import { BulkCheckDialog, type BulkCheckRow } from "./bulk-check-dialog";

const drawingsCount = (n: number) => `${n} drawing${n === 1 ? "" : "s"}`;

/** Fills in the reviewer while counting which statuses the selection can reach. */
const STAND_IN_REVIEWER = "(stand-in reviewer)";

type DoneHandler = (updatedIds: string[]) => void;

/** A selected row as the bar sees it: the bulk rules' fields plus what the shared dialogs list. */
export type BulkBarRow = BulkDrawing & { name: string; projectId: string; projectCode: string };

/**
 * The bar under the drawings table while drawings are selected. Each action
 * opens a dialog that shows which of the selected drawings will change and
 * which are skipped, and why — the same rules as editing one drawing.
 */
export function BulkDrawingBar({
  rows,
  users,
  currentUserId,
  checkRows,
  onDone,
  onClear,
}: {
  rows: BulkBarRow[];
  /** The same drawings for "Check DXFs"; null while automatic checks are off or not connected. */
  checkRows: BulkCheckRow[] | null;
  /** Possible owners and approving engineers — active users who aren't viewers. */
  users: UserOption[];
  currentUserId: string;
  /** Drops the changed drawings from the selection; the skipped ones stay selected. */
  onDone: DoneHandler;
  onClear: () => void;
}) {
  return (
    <div className="bulk-bar" role="region" aria-label="Change the selected drawings">
      <div className="bulk-count">
        <strong>{rows.length}</strong> selected <HelpTip topic="drawing-bulk" />
      </div>
      <div className="bulk-actions">
        <BulkStatusDialog rows={rows} users={users} currentUserId={currentUserId} onDone={onDone} />
        <BulkOwnerDialog rows={rows} users={users} onDone={onDone} />
        <BulkDueDateDialog rows={rows} onDone={onDone} />
        <SharedRemarkDialog rows={rows} onDone={onDone} />
        <SharedTimeDialog rows={rows} onDone={onDone} />
        {checkRows && (
          <BulkCheckDialog
            rows={checkRows}
            onDone={onDone}
            trigger={<BarButton icon={Icon.Upload} label="Check DXFs" short="DXFs" />}
          />
        )}
      </div>
      <button type="button" className="btn btn-ghost btn-sm bulk-clear" onClick={onClear}>
        <Icon.X className="ico" /> Clear
      </button>
    </div>
  );
}

/** A dialog trigger: the dialog passes its click handler and ref through `props`. */
function BarButton({
  icon: I,
  label,
  short,
  ...props
}: React.ComponentProps<"button"> & { icon: typeof Icon.User; label: string; short: string }) {
  return (
    <button type="button" className="btn btn-sm" aria-label={label} {...props}>
      <I className="ico" />
      <span className="max-[701px]:hidden">{label}</span>
      <span className="min-[701px]:hidden">{short}</span>
    </button>
  );
}

/** Runs a bulk action and reports the outcome: a success toast, plus a warning for drawings the server had to skip. */
function useBulkSubmit(total: number, onDone: DoneHandler, close: () => void) {
  const [pending, start] = useTransition();
  const router = useRouter();

  const run = (action: () => Promise<BulkDrawingResult>, success: (n: string) => string) => {
    start(async () => {
      const res = await action();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const left = total - res.updated.length;
      if (res.updated.length > 0) {
        toast.success(success(drawingsCount(res.updated.length)), {
          description: left > 0 ? `${drawingsCount(left)} not changed — still selected.` : undefined,
        });
      }
      if (res.skipped.length > 0) {
        toast.warning(`${drawingsCount(res.skipped.length)} not changed`, {
          description: (
            <ul>
              {res.skipped.map(s => <li key={s.id}>{s.code || "A drawing"} — {s.reason}</li>)}
            </ul>
          ),
        });
      }
      onDone(res.updated);
      close();
      router.refresh();
    });
  };
  return { pending, run };
}

/** Which of the selected drawings the change reaches, and why the others are left alone. */
function BulkPreview({ total, ready, skipped }: { total: number; ready: number; skipped: BulkSkip[] }) {
  return (
    <div className="grid gap-1.5" aria-live="polite">
      <p className="text-[12.5px]">
        {ready === total
          ? <>All <strong>{total}</strong> selected drawings will change.</>
          : <><strong>{ready}</strong> of {total} selected drawings will change.</>}
      </p>
      {skipped.length > 0 && (
        <div className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface-2)]">
          <div className="border-b border-[var(--color-line-soft)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-3)]">
            Not changed ({skipped.length})
          </div>
          <ul className="max-h-40 overflow-auto px-3 py-1.5 text-[12px]">
            {skipped.map(s => (
              <li key={s.id} className="py-0.5">
                <span className="font-mono font-semibold">{s.code}</span>{" "}
                <span className="text-[var(--color-text-2)]">— {s.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function BulkStatusDialog({
  rows,
  users,
  currentUserId,
  onDone,
}: {
  rows: BulkDrawing[];
  users: UserOption[];
  currentUserId: string;
  onDone: DoneHandler;
}) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState<DrawingStatus | "">("");
  const [reviewerId, setReviewerId] = useState("");
  const [comment, setComment] = useState("");
  const { pending, run } = useBulkSubmit(rows.length, onDone, () => setOpen(false));

  // The requester can't approve their own request; drawing owners are skipped per drawing.
  const reviewers = users.filter(u => u.id !== currentUserId);
  const reach = (status: DrawingStatus) =>
    planBulkStatus(rows, { to: status, actorId: currentUserId, nextReviewerId: STAND_IN_REVIEWER, comment: "-" }).ready;
  const options = DRAWING_STATUSES.map(s => ({ status: s, ready: reach(s).length }));
  const sendsBack = to !== "" && reach(to).some(r => r.kind === "reject");

  const needsReviewer = to === "need-approval" && !reviewerId;
  const plan = to && !needsReviewer
    ? planBulkStatus(rows, {
        to,
        actorId: currentUserId,
        nextReviewerId: to === "need-approval" ? reviewerId : null,
        comment: comment.trim() || null,
      })
    : null;

  function reset() {
    setTo("");
    setReviewerId("");
    setComment("");
  }

  const submit = () => {
    if (!to || !plan) return;
    run(
      () => bulkChangeDrawingStatus({
        ids: plan.ready.map(p => p.row.id),
        to,
        comment: comment.trim() || undefined,
        reviewerId: to === "need-approval" ? reviewerId : undefined,
      }),
      n => `Status changed to ${DRAWING_STATUS_LABEL[to]} on ${n}`,
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<BarButton icon={Icon.Flag} label="Change status" short="Status" />} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change status of {drawingsCount(rows.length)}</DialogTitle>
          <DialogDescription>
            Each drawing&apos;s latest revision moves. Everyone following them gets one email listing the drawings.{" "}
            <HelpTip topic="drawing-statuses" />
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="bulk-status-to">New status</Label>
            <select
              id="bulk-status-to"
              className={SELECT_CLASS}
              value={to}
              onChange={e => setTo(e.target.value as DrawingStatus)}
            >
              <option value="">— Select status —</option>
              {options.map(o => (
                <option key={o.status} value={o.status} disabled={o.ready === 0}>
                  {DRAWING_STATUS_LABEL[o.status]}
                  {o.ready === 0 ? " — none of them" : o.ready < rows.length ? ` — ${o.ready} of ${rows.length}` : ""}
                </option>
              ))}
            </select>
          </div>

          {to === "need-approval" && (
            <div className="grid gap-1.5">
              <Label htmlFor="bulk-status-reviewer">Approving engineer</Label>
              <select
                id="bulk-status-reviewer"
                className={SELECT_CLASS}
                value={reviewerId}
                onChange={e => setReviewerId(e.target.value)}
              >
                <option value="">— Select engineer —</option>
                {reviewers.map(u => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
              <p className="text-[12px] text-[var(--color-text-3)]">
                Not you. Drawings this engineer owns are skipped — someone else has to approve those.
              </p>
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="bulk-status-comment">
              Comment{" "}
              <span className="text-[var(--color-text-3)]">
                {sendsBack ? "(needed to send drawings back)" : "(optional)"}
              </span>
            </Label>
            <textarea
              id="bulk-status-comment"
              className={TEXTAREA_CLASS}
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder={to === "approved-b" ? "Client comments…" : "Anything the team should know"}
            />
          </div>

          {plan && <BulkPreview total={rows.length} ready={plan.ready.length} skipped={plan.skipped} />}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button onClick={submit} disabled={pending || !plan || plan.ready.length === 0}>
            {pending ? "Saving…" : plan?.ready.length ? `Change ${drawingsCount(plan.ready.length)}` : "Change status"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BulkOwnerDialog({ rows, users, onDone }: { rows: BulkDrawing[]; users: UserOption[]; onDone: DoneHandler }) {
  const [open, setOpen] = useState(false);
  const [ownerId, setOwnerId] = useState("");
  const { pending, run } = useBulkSubmit(rows.length, onDone, () => setOpen(false));
  const plan = ownerId ? planBulkOwner(rows, ownerId) : null;

  const submit = () => {
    if (!plan) return;
    const name = users.find(u => u.id === ownerId)?.name ?? "the new owner";
    run(
      () => bulkSetDrawingOwner({ ids: plan.ready.map(r => r.id), ownerId }),
      n => `${name} now owns ${n}`,
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        setOpen(next);
        if (!next) setOwnerId("");
      }}
    >
      <DialogTrigger render={<BarButton icon={Icon.User} label="Change owner" short="Owner" />} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change owner of {drawingsCount(rows.length)}</DialogTitle>
          <DialogDescription>The change is recorded in each drawing&apos;s history.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="bulk-owner">New owner</Label>
            <select id="bulk-owner" className={SELECT_CLASS} value={ownerId} onChange={e => setOwnerId(e.target.value)}>
              <option value="">— Select owner —</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
            <p className="text-[12px] text-[var(--color-text-3)]">
              The engineer approving a drawing&apos;s latest revision can&apos;t own it — those drawings are skipped.{" "}
              <HelpTip topic="drawing-approval" />
            </p>
          </div>

          {plan && <BulkPreview total={rows.length} ready={plan.ready.length} skipped={plan.skipped} />}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button onClick={submit} disabled={pending || !plan || plan.ready.length === 0}>
            {pending ? "Saving…" : plan?.ready.length ? `Change ${drawingsCount(plan.ready.length)}` : "Change owner"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BulkDueDateDialog({ rows, onDone }: { rows: BulkDrawing[]; onDone: DoneHandler }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [clear, setClear] = useState(false);
  const { pending, run } = useBulkSubmit(rows.length, onDone, () => setOpen(false));
  const dueDate = clear ? null : date || undefined;
  const plan = dueDate !== undefined ? planBulkDueDate(rows, dueDate) : null;

  function reset() {
    setDate("");
    setClear(false);
  }

  const submit = () => {
    if (!plan || dueDate === undefined) return;
    run(
      () => bulkSetDrawingDueDate({ ids: plan.ready.map(r => r.id), dueDate }),
      n => (dueDate ? `Due date set to ${formatDate(dueDate)} on ${n}` : `Due date cleared on ${n}`),
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={<BarButton icon={Icon.Calendar} label="Change due date" short="Due date" />} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change due date of {drawingsCount(rows.length)}</DialogTitle>
          <DialogDescription>
            Every selected drawing gets the same due date. Approved and As Built drawings never count as overdue.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="bulk-due">New due date</Label>
            <Input id="bulk-due" type="date" value={date} disabled={clear} onChange={e => setDate(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={clear} onChange={e => setClear(e.target.checked)} />
            No due date — clear it
          </label>

          {plan && <BulkPreview total={rows.length} ready={plan.ready.length} skipped={plan.skipped} />}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button onClick={submit} disabled={pending || !plan || plan.ready.length === 0}>
            {pending ? "Saving…" : plan?.ready.length ? `Change ${drawingsCount(plan.ready.length)}` : "Change due date"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Shared remark and shared time: one entry for all the selected drawings ──

/** The drawings a shared remark or shared time will cover. */
function SelectedDrawings({ rows }: { rows: BulkBarRow[] }) {
  const sorted = [...rows].sort((a, b) => a.projectCode.localeCompare(b.projectCode) || a.code.localeCompare(b.code));
  return (
    <div className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface-2)]">
      <div className="border-b border-[var(--color-line-soft)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-3)]">
        For {drawingsCount(rows.length)}
      </div>
      <ul className="max-h-40 overflow-auto px-3 py-1.5 text-[12px]" aria-label="Selected drawings">
        {sorted.map(r => (
          <li key={r.id} className="flex min-w-0 gap-1.5 py-0.5">
            <span className="shrink-0 font-mono font-semibold">{r.code}</span>
            <span className="min-w-0 truncate text-[var(--color-text-2)]">{r.name}</span>
            <span className="ml-auto shrink-0 font-mono text-[var(--color-text-3)]">{r.projectCode}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Saves a shared remark or shared time; the selection is cleared once it is written. */
function useSharedSubmit(rows: BulkBarRow[], onDone: DoneHandler, close: () => void) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (action: () => Promise<{ ok: true } | { ok: false; error: string }>, success: string) => {
    start(async () => {
      const res = await action();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(success);
      onDone(rows.map(r => r.id));
      close();
      router.refresh();
    });
  };
  return { pending, run };
}

type ManualSource = (typeof MANUAL_REMARK_SOURCES)[number];

function SharedRemarkDialog({ rows, onDone }: { rows: BulkBarRow[]; onDone: DoneHandler }) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<ManualSource>("client");
  const [body, setBody] = useState("");
  const { pending, run } = useSharedSubmit(rows, onDone, () => setOpen(false));
  const block = sharedRemarkBlock(rows);

  const submit = () => {
    if (block || !body.trim()) return;
    run(
      () => addSharedDrawingRemark({ drawingIds: rows.map(r => r.id), source, body: body.trim() }),
      `Remark added to ${drawingsCount(rows.length)}`,
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        setOpen(next);
        if (!next) {
          setSource("client");
          setBody("");
        }
      }}
    >
      <DialogTrigger render={<BarButton icon={Icon.Remark} label="Shared remark" short="Remark" />} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Remark on {drawingsCount(rows.length)}</DialogTitle>
          <DialogDescription>
            The same remark goes on each drawing&apos;s latest revision, marked as shared. Each drawing closes it on its
            own, once its revision fixes it. <HelpTip topic="drawing-shared" />
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          {block && <BlockedNote>{SHARED_BLOCK_MESSAGE[block]}</BlockedNote>}
          <div className="grid gap-1.5">
            <Label htmlFor="shared-remark-source">Raised by</Label>
            <select
              id="shared-remark-source"
              className={SELECT_CLASS}
              value={source}
              onChange={e => setSource(e.target.value as ManualSource)}
            >
              {MANUAL_REMARK_SOURCES.map(s => <option key={s} value={s}>{REMARK_SOURCE_LABEL[s]}</option>)}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="shared-remark-body">Remark</Label>
            <textarea
              id="shared-remark-body"
              className={TEXTAREA_CLASS}
              value={body}
              maxLength={4000}
              onChange={e => setBody(e.target.value)}
              placeholder="What needs to change on all of them? e.g. Use the new cable tray legend"
            />
          </div>
          <SelectedDrawings rows={rows} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button onClick={submit} disabled={pending || !!block || !body.trim()}>
            {pending ? "Adding…" : `Add to ${drawingsCount(rows.length)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SharedTimeDialog({ rows, onDone }: { rows: BulkBarRow[]; onDone: DoneHandler }) {
  const [open, setOpen] = useState(false);
  const [hours, setHours] = useState("");
  const [workDate, setWorkDate] = useState(todayIso);
  const [note, setNote] = useState("");
  const { pending, run } = useSharedSubmit(rows, onDone, () => setOpen(false));
  const block = sharedTimeBlock(rows);
  const parsed = parseHours(hours);
  const valid = typeof parsed === "number" && parsed <= MAX_ENTRY_HOURS && !!workDate && workDate <= todayIso();

  const submit = () => {
    if (block || typeof parsed !== "number") return;
    run(
      () => logSharedDrawingTime({ drawingIds: rows.map(r => r.id), hours: parsed, workDate, note: note.trim() || undefined }),
      `${formatHours(parsed)} logged once for ${drawingsCount(rows.length)}`,
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        setOpen(next);
        if (next) {
          setWorkDate(todayIso());
        } else {
          setHours("");
          setNote("");
        }
      }}
    >
      <DialogTrigger render={<BarButton icon={Icon.Clock} label="Shared time" short="Time" />} />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Shared time for {drawingsCount(rows.length)}</DialogTitle>
          <DialogDescription>
            Time spent on these drawings together. The hours are logged once and not split between the drawings: each
            shows them apart from its own logged hours, and the project total counts them once.{" "}
            <HelpTip topic="drawing-shared" />
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          {block && <BlockedNote>{SHARED_BLOCK_MESSAGE[block]}</BlockedNote>}
          <div className="grid grid-cols-[110px_1fr] gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="shared-time-hours">Hours</Label>
              <Input
                id="shared-time-hours"
                inputMode="decimal"
                value={hours}
                placeholder="e.g. 5"
                aria-invalid={!!hours && !valid}
                onChange={e => setHours(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="shared-time-date">Date</Label>
              <Input id="shared-time-date" type="date" max={todayIso()} value={workDate} onChange={e => setWorkDate(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="shared-time-note">Note (optional)</Label>
            <textarea
              id="shared-time-note"
              className={TEXTAREA_CLASS}
              value={note}
              maxLength={500}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. Coordination meeting with the client"
            />
          </div>
          <SelectedDrawings rows={rows} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button onClick={submit} disabled={pending || !!block || !valid}>
            {pending ? "Saving…" : valid ? `Log ${formatHours(parsed)} once` : "Log shared time"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
