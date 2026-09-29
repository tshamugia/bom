"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, type Tone } from "@/components/ui/badge";
import { Icon } from "@/components/icons";
import { formatDateTime } from "@/lib/format";
import { REMARK_SOURCES, REMARK_SOURCE_LABEL, type RemarkSource } from "@/lib/drawing-meta";
import { formatDrawingRevision } from "@/lib/drawing-status";
import { addDrawingRemark, reopenDrawingRemark, resolveDrawingRemark } from "@/server/actions/drawing-remarks";
import type { RemarkRow } from "@/server/queries/drawing-control";
import { SELECT_CLASS, TEXTAREA_CLASS } from "./drawing-form-fields";
import type { RevisionOption } from "./time-card";

const SOURCE_TONE: Record<RemarkSource, Tone> = { client: "pink", site: "warning", internal: "gray" };

function AddRemarkForm({ revisions, onDone }: { revisions: RevisionOption[]; onDone: () => void }) {
  const [source, setSource] = useState<RemarkSource>("client");
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
        <select className={SELECT_CLASS} value={source} onChange={e => setSource(e.target.value as RemarkSource)} aria-label="Raised by">
          {REMARK_SOURCES.map(s => <option key={s} value={s}>{REMARK_SOURCE_LABEL[s]}</option>)}
        </select>
        <select className={SELECT_CLASS} value={revisionId} onChange={e => setRevisionId(e.target.value)} aria-label="Revision">
          {revisions.map(r => <option key={r.id} value={r.id}>On {formatDrawingRevision(r.number)}</option>)}
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
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onDone} disabled={pending}>Cancel</Button>
        <Button size="sm" onClick={submit} disabled={pending || !body.trim()}>{pending ? "Adding…" : "Add remark"}</Button>
      </div>
    </div>
  );
}

function OpenRemark({ r, readOnly }: { r: RemarkRow; readOnly: boolean }) {
  const [resolving, setResolving] = useState(false);
  const [resolution, setResolution] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  const resolve = () => {
    start(async () => {
      const res = await resolveDrawingRemark({ id: r.id, resolution: resolution.trim() || undefined });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Remark resolved");
      router.refresh();
    });
  };

  return (
    <div className="grid gap-1.5 px-4 py-3" style={{ borderBottom: "1px solid var(--line-soft)" }}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={SOURCE_TONE[r.source]}>{REMARK_SOURCE_LABEL[r.source]}</Badge>
        <span className="mono muted text-[11.5px]">{formatDrawingRevision(r.revisionNumber)}</span>
        <span className="muted text-[11.5px]">{r.raisedByName ?? "—"} · {formatDateTime(r.createdAt)}</span>
        <span className="spacer" />
        {!resolving && !readOnly && (
          <button type="button" className="btn btn-sm" onClick={() => setResolving(true)}>
            <Icon.Check className="ico" /> Resolve
          </button>
        )}
      </div>
      <div className="whitespace-pre-line text-[13px]">{r.body}</div>
      {resolving && (
        <div className="grid gap-2">
          <textarea
            className={TEXTAREA_CLASS}
            value={resolution}
            maxLength={2000}
            onChange={e => setResolution(e.target.value)}
            placeholder="How was it addressed? (optional)"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setResolving(false)} disabled={pending}>Cancel</Button>
            <Button size="sm" onClick={resolve} disabled={pending}>{pending ? "Saving…" : "Mark resolved"}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ResolvedRemark({ r, readOnly }: { r: RemarkRow; readOnly: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="grid gap-1 px-4 py-2.5" style={{ borderTop: "1px solid var(--line-soft)" }}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="success">Resolved</Badge>
        <span className="muted text-[11.5px]">
          {REMARK_SOURCE_LABEL[r.source]} · raised on {formatDrawingRevision(r.revisionNumber)}
          {r.resolvedInRevisionNumber ? `, resolved in ${formatDrawingRevision(r.resolvedInRevisionNumber)}` : ""}
          {" "}by {r.resolvedByName ?? "—"}
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
      <div className="whitespace-pre-line text-[12.5px] text-[var(--color-text-2)]">{r.body}</div>
      {r.resolution && (
        <div className="whitespace-pre-line rounded-md bg-[var(--color-surface-2)] px-2.5 py-1.5 text-[12.5px]">{r.resolution}</div>
      )}
    </div>
  );
}

export function RemarksCard({
  remarks,
  revisions,
  readOnly = false,
}: {
  remarks: RemarkRow[];
  revisions: RevisionOption[];
  readOnly?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const open = remarks.filter(r => !r.resolvedAt);
  const resolved = remarks.filter(r => r.resolvedAt);

  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h3 className="card-title">Remarks</h3>
          <p className="card-sub">Comments from the client, the site or the team that the drawing has to address.</p>
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
      {open.map(r => <OpenRemark key={r.id} r={r} readOnly={readOnly} />)}
      {open.length === 0 && !adding && (
        <div className="muted px-4 py-3 text-[12.5px]">No open remarks.</div>
      )}
      {resolved.length > 0 && (
        <details>
          <summary className="cursor-pointer px-4 py-2.5 text-[12.5px] text-[var(--color-text-2)]">
            {resolved.length} resolved
          </summary>
          {resolved.map(r => <ResolvedRemark key={r.id} r={r} readOnly={readOnly} />)}
        </details>
      )}
    </div>
  );
}
