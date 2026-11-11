"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Badge, type Tone } from "@/components/ui/badge";
import { Icon } from "@/components/icons";
import { formatDateTime } from "@/lib/format";
import { MANUAL_REMARK_SOURCES, REMARK_SOURCE_LABEL, type RemarkSource } from "@/lib/drawing-meta";
import { CHECK_SEVERITY_LABEL } from "@/lib/drawing-checks";
import { addDrawingRemark, reopenDrawingRemark, resolveDrawingRemark } from "@/server/actions/drawing-remarks";
import { markCheckRemarkFalse } from "@/server/actions/drawing-check-settings";
import { HelpTip } from "@/components/help/help-tip";
import type { RemarkRow } from "@/server/queries/drawing-control";
import { SELECT_CLASS, TEXTAREA_CLASS } from "./drawing-form-fields";
import type { RevisionOption } from "./time-card";

const SOURCE_TONE: Record<RemarkSource, Tone> = { client: "pink", site: "warning", internal: "gray", check: "info" };

type ManualSource = (typeof MANUAL_REMARK_SOURCES)[number];

/** Automatic remarks name the rule they report; a WARNING is marked "To check" — some checks are heuristics. */
function CheckTags({ r }: { r: RemarkRow }) {
  if (r.source !== "check") return null;
  return (
    <>
      {r.checkRuleId && <span className="mono muted text-[11.5px]">{r.checkRuleId}</span>}
      {r.checkSeverity === "WARNING" && <Badge tone="warning">{CHECK_SEVERITY_LABEL.WARNING}</Badge>}
    </>
  );
}

/** A remark written for several drawings at once: says so in the remark's header. */
function SharedTag({ r }: { r: RemarkRow }) {
  if (!r.shared) return null;
  return <Badge tone="accent">Shared · {r.shared.length} drawings</Badge>;
}

/**
 * The drawings a shared remark was written for, each open or resolved on its
 * own. Listed open while short; a long list folds away.
 */
function SharedDrawings({ r, drawingId }: { r: RemarkRow; drawingId: string }) {
  if (!r.shared) return null;
  const others = r.shared.filter(s => s.drawingId !== drawingId);
  const open = others.filter(s => !s.resolved).length;
  return (
    <details className="text-[12px]" open={others.length <= 6}>
      <summary className="cursor-pointer text-[var(--color-text-2)]">
        Also on {others.length} other drawing{others.length === 1 ? "" : "s"}
        {others.length > 0 && <> · {open} open</>}
      </summary>
      <ul className="mt-1 grid gap-0.5">
        {others.map(s => (
          <li key={s.drawingId} className="flex min-w-0 items-center gap-1.5">
            {s.archived ? (
              <span className="mono muted shrink-0">{s.code}</span>
            ) : (
              <Link href={`/drawings/${s.drawingId}#remarks`} className="mono shrink-0 font-semibold hover:underline">{s.code}</Link>
            )}
            <span className="muted min-w-0 truncate">{s.name}</span>
            <span className="ml-auto shrink-0">
              {s.archived
                ? <span className="muted">archived</span>
                : s.resolved
                  ? <span style={{ color: "var(--green)" }}>resolved</span>
                  : <span style={{ color: "var(--amber)", fontWeight: 600 }}>open</span>}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function AddRemarkForm({ revisions, onDone }: { revisions: RevisionOption[]; onDone: () => void }) {
  const [source, setSource] = useState<ManualSource>("client");
  const [revisionId, setRevisionId] = useState(revisions[0]?.id ?? "");
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  const submit = () => {
    start(async () => {
      const res = await addDrawingRemark({ revisionId, source, body: body.trim() });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setBody("");
      onDone();
      router.refresh();
    });
  };

  return (
    <div className="grid gap-2 border-b border-[var(--color-line)] p-4">
      <div className="grid grid-cols-2 gap-2">
        <select className={SELECT_CLASS} value={source} onChange={e => setSource(e.target.value as ManualSource)} aria-label="Raised by">
          {MANUAL_REMARK_SOURCES.map(s => <option key={s} value={s}>{REMARK_SOURCE_LABEL[s]}</option>)}
        </select>
        <select className={SELECT_CLASS} value={revisionId} onChange={e => setRevisionId(e.target.value)} aria-label="Revision">
          {revisions.map(r => <option key={r.id} value={r.id}>On {r.label}</option>)}
        </select>
      </div>
      <textarea
        className={TEXTAREA_CLASS}
        value={body}
        maxLength={4000}
        onChange={e => setBody(e.target.value)}
        placeholder="What needs to change? e.g. Move camera C-12 to the east wall"
        autoFocus
      />
      <div className="flex flex-wrap justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onDone} disabled={pending}>Cancel</Button>
        <Button size="sm" onClick={submit} disabled={pending || !body.trim()}>{pending ? "Adding…" : "Add remark"}</Button>
      </div>
    </div>
  );
}

function OpenRemark({ r, readOnly, drawingId }: { r: RemarkRow; readOnly: boolean; drawingId: string }) {
  const [resolving, setResolving] = useState(false);
  const [resolution, setResolution] = useState("");
  // "მცდარი შეცდომა": the automatic check is wrong here — close it and stop the rule on this drawing.
  const [falseError, setFalseError] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const automatic = r.source === "check" && !!r.checkRuleId;

  const resolve = () => {
    start(async () => {
      const res = falseError
        ? await markCheckRemarkFalse({ id: r.id, reason: resolution.trim() })
        : await resolveDrawingRemark({ id: r.id, resolution: resolution.trim() || undefined });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(falseError ? `Marked as a false error — ${r.checkRuleId} isn't checked on this drawing any more` : "Remark resolved");
      router.refresh();
    });
  };

  return (
    <div className="grid gap-1.5 px-4 py-3" style={{ borderBottom: "1px solid var(--line-soft)" }}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={SOURCE_TONE[r.source]}>{REMARK_SOURCE_LABEL[r.source]}</Badge>
        <CheckTags r={r} />
        <SharedTag r={r} />
        <span className="mono muted text-[11.5px]">{r.revisionLabel}</span>
        <span className="muted text-[11.5px]">
          {r.source === "check" ? formatDateTime(r.createdAt) : <>{r.raisedByName ?? "—"} · {formatDateTime(r.createdAt)}</>}
        </span>
        <span className="spacer" />
        {!resolving && !readOnly && (
          <button type="button" className="btn btn-sm" onClick={() => setResolving(true)}>
            <Icon.Check className="ico" /> Resolve
          </button>
        )}
      </div>
      <div className="whitespace-pre-line text-[13px] [overflow-wrap:anywhere]">{r.body}</div>
      <SharedDrawings r={r} drawingId={drawingId} />
      {resolving && (
        <div className="grid gap-2">
          <textarea
            className={TEXTAREA_CLASS}
            value={resolution}
            maxLength={2000}
            onChange={e => setResolution(e.target.value)}
            placeholder={falseError ? "Why is the check wrong here? (required)" : "How was it addressed? (optional)"}
            autoFocus
          />
          {automatic && (
            <label className="flex cursor-pointer items-start gap-2 text-[12.5px]">
              <input type="checkbox" className="mt-0.5" checked={falseError} onChange={e => setFalseError(e.target.checked)} />
              <span className="grid gap-0.5">
                <span className="flex items-center gap-1.5 font-medium">False error <HelpTip topic="drawing-check" /></span>
                <span className="muted">
                  The check is wrong here: {r.checkRuleId} stops being checked on this drawing until an admin takes it back.
                </span>
              </span>
            </label>
          )}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setResolving(false)} disabled={pending}>Cancel</Button>
            <Button size="sm" onClick={resolve} disabled={pending || (falseError && !resolution.trim())}>
              {pending ? "Saving…" : falseError ? "Mark as false error" : "Mark resolved"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ResolvedRemark({ r, readOnly, drawingId }: { r: RemarkRow; readOnly: boolean; drawingId: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="grid gap-1 px-4 py-2.5" style={{ borderTop: "1px solid var(--line-soft)" }}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="success">Resolved</Badge>
        <SharedTag r={r} />
        <span className="muted text-[11.5px]">
          {REMARK_SOURCE_LABEL[r.source]} · raised on {r.revisionLabel}
          {r.resolvedInRevisionNumber ? `, resolved in ${r.resolvedInRevisionLabel}` : ""}
          {r.resolvedByName ? ` by ${r.resolvedByName}` : r.source === "check" ? " by the automatic check" : " by —"}
        </span>
        <span className="spacer" />
        {!readOnly && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await reopenDrawingRemark({ id: r.id });
                if (!res.ok) toast.error(res.error);
                else router.refresh();
              })
            }
          >
            Reopen
          </button>
        )}
      </div>
      <div className="whitespace-pre-line text-[12.5px] text-[var(--color-text-2)] [overflow-wrap:anywhere]">{r.body}</div>
      <SharedDrawings r={r} drawingId={drawingId} />
      {r.resolution && (
        <div className="whitespace-pre-line rounded-md bg-[var(--color-surface-2)] px-2.5 py-1.5 text-[12.5px] [overflow-wrap:anywhere]">{r.resolution}</div>
      )}
    </div>
  );
}

export function RemarksCard({
  drawingId,
  remarks,
  revisions,
  readOnly = false,
}: {
  drawingId: string;
  remarks: RemarkRow[];
  revisions: RevisionOption[];
  readOnly?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const open = remarks.filter(r => !r.resolvedAt);
  const resolved = remarks.filter(r => r.resolvedAt);

  return (
    <div id="remarks" className="card anchor-target">
      <div className="card-head max-[701px]:flex-wrap">
        <div className="min-w-0">
          <h3 className="card-title">Remarks</h3>
          <p className="card-sub">Comments from the client, the site or the team, and what the automatic DXF check found, that the drawing has to address.</p>
        </div>
        <span className="spacer" />
        {open.length > 0 && <Badge tone="warning">{open.length} open</Badge>}
        {!adding && !readOnly && (
          <button type="button" className="btn btn-sm" onClick={() => setAdding(true)}>
            <Icon.Plus className="ico" /> Add
          </button>
        )}
      </div>
      {adding && <AddRemarkForm revisions={revisions} onDone={() => setAdding(false)} />}
      {open.map(r => <OpenRemark key={r.id} r={r} readOnly={readOnly} drawingId={drawingId} />)}
      {open.length === 0 && !adding && (
        <div className="muted px-4 py-3 text-[12.5px]">No open remarks.</div>
      )}
      {resolved.length > 0 && (
        <details>
          <summary className="cursor-pointer px-4 py-2.5 text-[12.5px] text-[var(--color-text-2)]">
            {resolved.length} resolved
          </summary>
          {resolved.map(r => <ResolvedRemark key={r.id} r={r} readOnly={readOnly} drawingId={drawingId} />)}
        </details>
      )}
    </div>
  );
}
