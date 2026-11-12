"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge, type Tone } from "@/components/ui/badge";
import { Icon } from "@/components/icons";
import { HelpTip } from "@/components/help/help-tip";
import { MAX_BULK_DRAWINGS } from "@/lib/drawing-bulk";
import { MAX_DXF_MB } from "@/lib/drawing-checks";
import {
  CHECKER_BUSY_GIVE_UP_MS, CHECKER_BUSY_RETRY_MS, STANDARD_FILE_NAME_EXAMPLE, planBulkCheck,
  type BulkCheckDrawing, type BulkCheckItem, type BulkCheckPlan,
} from "@/lib/drawing-check-link";
import { formatFileSize } from "@/lib/drawing-files";
import {
  cancelDrawingCheckUpload, confirmDrawingCheckUpload, requestBulkDrawingCheckUpload,
} from "@/server/actions/drawing-checks";
import { planBulkDrawingChecks } from "@/server/actions/drawing-check-runs";
import { postToBucket } from "./upload-pdf-dialog";
import { SELECT_CLASS } from "./drawing-form-fields";

export type BulkCheckRow = BulkCheckDrawing & { name: string };

type Picked = { key: string; file: File };

/** Where one file is once the upload started. */
type Progress =
  | { state: "waiting" }
  | { state: "uploading"; pct: number }
  | { state: "busy"; since: number }
  | { state: "sent" }
  | { state: "failed"; message: string };

const filesCount = (n: number) => `${n} file${n === 1 ? "" : "s"}`;

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * "Check DXFs" in the /drawings bulk bar (issue #18): drop the DXFs of the
 * ticked drawings, see which file goes to which drawing (`planBulkCheck`),
 * pick a drawing by hand where the name can't decide, then upload them one by
 * one through the usual check flow. The server re-checks the plan first.
 */
export function BulkCheckDialog({
  rows,
  onDone,
  trigger,
}: {
  rows: BulkCheckRow[];
  /** Drawings whose file went to the checker; the bar unticks them. */
  onDone: (drawingIds: string[]) => void;
  trigger: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<Picked[]>([]);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [serverPlan, setServerPlan] = useState<BulkCheckPlan | null>(null);
  const [progress, setProgress] = useState<Record<string, Progress>>({});
  const [phase, setPhase] = useState<"plan" | "checking" | "uploading" | "done">("plan");
  const [dragging, setDragging] = useState(false);
  const stop = useRef(false);
  const nextKey = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const byId = new Map(rows.map(r => [r.id, r]));
  const localPlan = planBulkCheck({
    drawings: rows,
    files: files.map(f => ({ key: f.key, name: f.file.name, size: f.file.size })),
    picks,
  });
  // Once the server has answered, its plan is the one that runs.
  const plan = serverPlan ?? localPlan;
  const ready = plan.items.filter(i => i.state === "ready");
  const toPick = plan.items.filter(i => i.state === "pick").length;
  const left = plan.items.filter(i => i.state === "stopped").length;
  const busy = phase === "checking" || phase === "uploading";

  const reset = () => {
    setFiles([]);
    setPicks({});
    setServerPlan(null);
    setProgress({});
    setPhase("plan");
    stop.current = false;
    if (inputRef.current) inputRef.current.value = "";
  };

  const add = (list: FileList | null) => {
    if (!list?.length) return;
    setServerPlan(null);
    setFiles(prev => {
      const seen = new Set(prev.map(p => `${p.file.name}/${p.file.size}/${p.file.lastModified}`));
      const added = [...list]
        .filter(f => !seen.has(`${f.name}/${f.size}/${f.lastModified}`))
        .map(file => ({ key: `f${nextKey.current++}`, file }));
      return [...prev, ...added];
    });
    if (inputRef.current) inputRef.current.value = "";
  };

  const remove = (key: string) => {
    setServerPlan(null);
    setFiles(prev => prev.filter(f => f.key !== key));
    setPicks(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const pick = (key: string, drawingId: string) => {
    setServerPlan(null);
    setPicks(prev => {
      const next = { ...prev };
      if (drawingId) next[key] = drawingId;
      else delete next[key];
      return next;
    });
  };

  const setOne = (key: string, p: Progress) => setProgress(prev => ({ ...prev, [key]: p }));

  /** One file through request → bucket → confirm, waiting while the checker's queue is full. */
  const uploadOne = async (item: BulkCheckItem, file: File): Promise<boolean> => {
    setOne(item.key, { state: "uploading", pct: 0 });
    const req = await requestBulkDrawingCheckUpload({ drawingId: item.drawingId!, fileName: file.name, size: file.size });
    if (!req.ok) {
      setOne(item.key, { state: "failed", message: req.error });
      return false;
    }
    const sent = await postToBucket(req.url, req.fields, file, pct => setOne(item.key, { state: "uploading", pct }));
    if (!sent) {
      await cancelDrawingCheckUpload({ runId: req.runId });
      setOne(item.key, { state: "failed", message: "The upload didn't finish — check your connection and try again." });
      return false;
    }
    const since = Date.now();
    for (;;) {
      const done = await confirmDrawingCheckUpload({ runId: req.runId, retryWhenBusy: true });
      if (done.ok) {
        setOne(item.key, { state: "sent" });
        return true;
      }
      if (!done.busy || Date.now() - since > CHECKER_BUSY_GIVE_UP_MS || stop.current) {
        if (done.busy) await cancelDrawingCheckUpload({ runId: req.runId });
        setOne(item.key, {
          state: "failed",
          message: done.busy ? "The checker stayed busy — check this file again later." : done.error,
        });
        return false;
      }
      setOne(item.key, { state: "busy", since });
      await wait(CHECKER_BUSY_RETRY_MS);
    }
  };

  const start = async () => {
    setPhase("checking");
    let checked: BulkCheckPlan;
    try {
      const res = await planBulkDrawingChecks({
        drawingIds: rows.map(r => r.id),
        files: files.map(f => ({ key: f.key, name: f.file.name, size: f.file.size })),
        picks,
      });
      if (!res.ok) {
        toast.error(res.error);
        setPhase("plan");
        return;
      }
      checked = res.plan;
    } catch {
      toast.error("The plan couldn't be checked — try again.");
      setPhase("plan");
      return;
    }
    setServerPlan(checked);
    const go = checked.items.filter(i => i.state === "ready");
    if (go.length === 0) {
      toast.warning("No file can be uploaded", { description: "The list says why for each file." });
      setPhase("plan");
      return;
    }

    setPhase("uploading");
    setProgress(Object.fromEntries(go.map(i => [i.key, { state: "waiting" } as Progress])));
    const fileOf = new Map(files.map(f => [f.key, f.file]));
    const sentTo: string[] = [];
    let failed = 0;
    for (const item of go) {
      if (stop.current) {
        setOne(item.key, { state: "failed", message: "Stopped before it was uploaded." });
        failed += 1;
        continue;
      }
      let ok = false;
      try {
        ok = await uploadOne(item, fileOf.get(item.key)!);
      } catch {
        setOne(item.key, { state: "failed", message: "The upload failed — try again." });
      }
      if (ok) sentTo.push(item.drawingId!);
      else failed += 1;
    }
    setPhase("done");
    router.refresh();
    onDone(sentTo);
    if (sentTo.length) {
      toast.success(`${filesCount(sentTo.length)} handed to the checker`, {
        description: "Results arrive on each drawing within a few minutes.",
      });
    }
    if (failed) toast.warning(`${filesCount(failed)} not checked`, { description: "The list says why." });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (busy) return;
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Check DXFs of {rows.length} drawing{rows.length === 1 ? "" : "s"}</DialogTitle>
          <DialogDescription>
            Each file goes to the ticked drawing with its sheet code and is checked like a single upload.{" "}
            <HelpTip topic="drawing-check-bulk" />
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-w-0 gap-3">
          {phase === "plan" && (
            <label
              className="grid cursor-pointer place-items-center gap-1 rounded-md border border-dashed px-4 py-5 text-center text-[13px]"
              style={{
                borderColor: dragging ? "var(--accent)" : "var(--line)",
                background: dragging ? "var(--accent-soft)" : "var(--surface-2)",
              }}
              onDragOver={e => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={e => {
                e.preventDefault();
                setDragging(false);
                add(e.dataTransfer.files);
              }}
            >
              <Icon.Upload className="ico" />
              <span><strong>Drop DXF files here</strong> or tap to choose them</span>
              <span className="muted text-[12px]">
                Up to {MAX_BULK_DRAWINGS} files, {MAX_DXF_MB} MB each, named like{" "}
                <span className="mono [overflow-wrap:anywhere]">{STANDARD_FILE_NAME_EXAMPLE}</span>
              </span>
              <input
                ref={inputRef}
                type="file"
                accept=".dxf"
                multiple
                className="sr-only"
                onChange={e => add(e.target.files)}
              />
            </label>
          )}

          {plan.blocked.length > 0 && (
            <div className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 py-2 text-[12px]">
              <div className="mb-1 font-semibold">Left out of the bulk upload</div>
              <ul className="m-0 grid gap-0.5 pl-4">
                {plan.blocked.map(b => (
                  <li key={b.id}><span className="mono font-semibold">{b.code}</span> — {b.reason}</li>
                ))}
              </ul>
            </div>
          )}

          {files.length > 0 && (
            <>
              <p className="m-0 text-[12.5px]" aria-live="polite">
                {phase === "plan" || phase === "checking" ? (
                  <>
                    <strong>{ready.length}</strong> of {filesCount(files.length)} ready
                    {toPick ? <>, <strong>{toPick}</strong> need{toPick === 1 ? "s" : ""} a drawing</> : null}
                    {left ? <>, {left} left out</> : null}.
                  </>
                ) : (
                  <UploadSummary progress={progress} />
                )}
              </p>
              <ul className="m-0 max-h-[46vh] list-none overflow-auto rounded-md border border-[var(--color-line)] p-0">
                {plan.items.map(item => (
                  <FileRow
                    key={item.key}
                    item={item}
                    rows={byId}
                    pickValue={picks[item.key] ?? ""}
                    progress={progress[item.key]}
                    locked={phase !== "plan"}
                    onPick={id => pick(item.key, id)}
                    onRemove={() => remove(item.key)}
                  />
                ))}
              </ul>
            </>
          )}
        </div>

        <DialogFooter>
          {phase === "uploading" ? (
            <Button variant="outline" onClick={() => { stop.current = true; }}>Stop after this file</Button>
          ) : (
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              {phase === "done" ? "Close" : "Cancel"}
            </Button>
          )}
          {phase !== "done" && (
            <Button onClick={start} disabled={busy || ready.length === 0}>
              {phase === "checking"
                ? "Checking the plan…"
                : phase === "uploading"
                  ? "Uploading…"
                  : ready.length
                    ? `Upload and check ${filesCount(ready.length)}`
                    : "Upload and check"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UploadSummary({ progress }: { progress: Record<string, Progress> }) {
  const all = Object.values(progress);
  const sent = all.filter(p => p.state === "sent").length;
  const failed = all.filter(p => p.state === "failed").length;
  const open = all.length - sent - failed;
  return (
    <>
      <strong>{sent}</strong> of {filesCount(all.length)} handed to the checker
      {failed ? <>, {failed} not checked</> : null}
      {open ? <> — keep this page open until the rest are sent.</> : <>. Results arrive on each drawing.</>}
    </>
  );
}

const STATE_BADGE: Record<BulkCheckItem["state"], { tone: Tone; label: string }> = {
  ready: { tone: "success", label: "Ready" },
  pick: { tone: "warning", label: "Pick a drawing" },
  stopped: { tone: "gray", label: "Left out" },
};

function progressBadge(p: Progress): { tone: Tone; label: string } {
  switch (p.state) {
    case "waiting": return { tone: "gray", label: "Waiting" };
    case "uploading": return { tone: "info", label: p.pct < 100 ? `Uploading ${p.pct}%` : "Handing over…" };
    case "busy": return { tone: "warning", label: "Checker busy" };
    case "sent": return { tone: "success", label: "Checking" };
    case "failed": return { tone: "danger", label: "Not checked" };
  }
}

function FileRow({
  item,
  rows,
  pickValue,
  progress,
  locked,
  onPick,
  onRemove,
}: {
  item: BulkCheckItem;
  rows: Map<string, BulkCheckRow>;
  pickValue: string;
  progress: Progress | undefined;
  locked: boolean;
  onPick: (drawingId: string) => void;
  onRemove: () => void;
}) {
  const badge = progress ? progressBadge(progress) : STATE_BADGE[item.state];
  const target = item.drawingId ? rows.get(item.drawingId) : null;
  const note = progress?.state === "failed"
    ? progress.message
    : progress?.state === "busy"
      ? `Its queue is full — trying again every ${CHECKER_BUSY_RETRY_MS / 1000} s.`
      : item.reason ?? (item.link ? `${target?.code} gets the sheet code ${item.link}.` : null);

  return (
    <li
      className="grid gap-1.5 px-3 py-2.5 min-[701px]:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] min-[701px]:gap-x-3"
      style={{ borderTop: "1px solid var(--line-soft)" }}
    >
      <div className="flex min-w-0 items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="mono text-[12.5px] font-medium [overflow-wrap:anywhere]">{item.name}</div>
          <div className="muted text-[11.5px]">{formatFileSize(item.size)}{item.sheetCode ? ` · sheet ${item.sheetCode}` : ""}</div>
        </div>
        {!locked && (
          <button type="button" className="btn btn-ghost btn-sm" aria-label={`Remove ${item.name}`} onClick={onRemove}>
            <Icon.X className="ico" />
          </button>
        )}
      </div>
      <div className="grid min-w-0 gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Icon.ArrowRight className="ico shrink-0 text-[var(--color-text-3)] max-[701px]:hidden" />
          {item.options.length > 0 && !locked ? (
            <select
              aria-label={`Drawing for ${item.name}`}
              className={`${SELECT_CLASS} min-w-0 flex-1`}
              value={pickValue}
              onChange={e => onPick(e.target.value)}
            >
              <option value="">— Pick the drawing —</option>
              {item.options.map(id => {
                const d = rows.get(id);
                return <option key={id} value={id}>{d ? `${d.code} — ${d.name}` : id}</option>;
              })}
            </select>
          ) : target ? (
            <span className="min-w-0 text-[12.5px] [overflow-wrap:anywhere]">
              <span className="mono font-semibold">{target.code}</span> {target.name}
            </span>
          ) : (
            <span className="muted text-[12.5px]">—</span>
          )}
          <Badge tone={badge.tone}>{badge.label}</Badge>
        </div>
        {note && (
          <p
            className="m-0 text-[12px] [overflow-wrap:anywhere]"
            style={{ color: progress?.state === "failed" ? "var(--red)" : "var(--text-2)" }}
          >
            {note}
          </p>
        )}
      </div>
    </li>
  );
}
