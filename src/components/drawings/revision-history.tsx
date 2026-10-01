import { Icon } from "@/components/icons";
import { formatDateTime } from "@/lib/format";
import { formatDrawingRevision, type DrawingStatus } from "@/lib/drawing-status";
import { drawingFileHref, drawingFileName, formatFileSize } from "@/lib/drawing-files";
import type { DrawingFileRow } from "@/server/queries/drawing-files";
import type { DrawingEventRow, DrawingRevisionRow } from "@/server/queries/drawings";
import { DrawingStatusBadge } from "./drawing-status-badge";
import { CommentForm } from "./comment-form";
import { BomImpactToggle } from "./bom-impact-toggle";

function statusTitle(from: DrawingStatus | null, to: DrawingStatus | null): string {
  if (to === "need-approval") return "Approval requested";
  if (from === "need-approval" && to === "awaiting-approval") return "Approved by second engineer";
  if (from === "need-approval" && to === "in-progress") return "Returned to In Progress";
  return "Status changed";
}

function EventItem({ e, revisionLabel }: { e: DrawingEventRow; revisionLabel: string }) {
  const meta = (
    <div className="tl-meta">{e.actorName ?? "Unknown user"} · {formatDateTime(e.createdAt)}</div>
  );
  switch (e.kind) {
    case "created":
      return (
        <div className="tl-item done">
          <div className="tl-dot" />
          <div className="tl-title">{revisionLabel} created</div>
          {meta}
        </div>
      );
    case "updated":
      return (
        <div className="tl-item">
          <div className="tl-dot" />
          <div className="tl-title">Details updated</div>
          {meta}
          <div className="mt-1 whitespace-pre-line text-[12.5px] text-[var(--color-text-2)] [overflow-wrap:anywhere]">{e.body}</div>
        </div>
      );
    case "status":
      return (
        <div className="tl-item active">
          <div className="tl-dot" />
          <div className="tl-title">{statusTitle(e.fromStatus, e.toStatus)}</div>
          {meta}
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {e.fromStatus && <DrawingStatusBadge status={e.fromStatus} />}
            <span className="muted">→</span>
            {e.toStatus && <DrawingStatusBadge status={e.toStatus} />}
          </div>
          {e.body && (
            <div className="mt-1.5 whitespace-pre-line rounded-md bg-[var(--color-surface-2)] px-2.5 py-1.5 text-[12.5px] [overflow-wrap:anywhere]">{e.body}</div>
          )}
        </div>
      );
    case "file":
      return (
        <div className="tl-item">
          <div className="tl-dot" />
          <div className="tl-title">Drawing PDF</div>
          {meta}
          <div className="mt-1 text-[12.5px] text-[var(--color-text-2)] [overflow-wrap:anywhere]">{e.body}</div>
        </div>
      );
    case "comment":
      return (
        <div className="tl-item">
          <div className="tl-dot" />
          <div className="tl-title">Comment</div>
          {meta}
          <div className="mt-1.5 whitespace-pre-line rounded-md bg-[var(--color-surface-2)] px-2.5 py-1.5 text-[12.5px] [overflow-wrap:anywhere]">{e.body}</div>
        </div>
      );
  }
}

function RevisionCard({
  rev,
  events,
  file,
  drawingCode,
  isLatest,
  readOnly,
}: {
  rev: DrawingRevisionRow;
  events: DrawingEventRow[];
  file: DrawingFileRow | undefined;
  drawingCode: string;
  isLatest: boolean;
  readOnly: boolean;
}) {
  const label = formatDrawingRevision(rev.number);
  return (
    <>
      <div className="grid gap-1 px-4 pt-3 text-[12.5px]">
        <div className="italic text-[var(--color-text-2)] [overflow-wrap:anywhere]">&ldquo;{rev.commitMessage}&rdquo;</div>
        <div className="muted">
          Created by {rev.createdByName ?? "—"} · {formatDateTime(rev.createdAt)}
          {rev.reviewedAt && <> · Approved internally by {rev.reviewedByName ?? "—"} · {formatDateTime(rev.reviewedAt)}</>}
          {!isLatest && rev.lockedAt && <> · Locked {formatDateTime(rev.lockedAt)}</>}
        </div>
        {/* Viewers get the PDF they may use from the Drawing PDF card, not older ones. */}
        {file && !readOnly && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Icon.Doc className="ico shrink-0 text-[var(--color-text-3)]" aria-hidden />
            <span className="mono">{drawingFileName(drawingCode, rev.number)}</span>
            <span className="muted">{formatFileSize(file.sizeBytes)}</span>
            <a href={drawingFileHref(file.id)} target="_blank" rel="noopener" className="hover:underline">Open</a>
            <a href={drawingFileHref(file.id, true)} className="hover:underline">Download</a>
          </div>
        )}
        {/* Rev 1 has nothing before it to outdate; viewers don't see BOM links. */}
        {isLatest && !readOnly && rev.number > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="muted">
              {rev.bomImpact
                ? "Changes the BOM — BOMs built from earlier revisions show as outdated."
                : "No BOM change — BOMs built from earlier revisions stay current."}
            </span>
            <BomImpactToggle revisionId={rev.id} bomImpact={rev.bomImpact} />
          </div>
        )}
      </div>
      <div className="p-4">
        <div className="timeline">
          {events.map(e => <EventItem key={e.id} e={e} revisionLabel={label} />)}
        </div>
        {!readOnly && (
          <div className="mt-4">
            <CommentForm revisionId={rev.id} revisionLabel={label} />
          </div>
        )}
      </div>
    </>
  );
}

export function RevisionHistory({
  revisions,
  events,
  files,
  drawingCode,
  readOnly = false,
}: {
  revisions: DrawingRevisionRow[];
  events: DrawingEventRow[];
  /** The current PDF of each revision. */
  files: DrawingFileRow[];
  drawingCode: string;
  readOnly?: boolean;
}) {
  const byRevision = new Map<string, DrawingEventRow[]>();
  for (const e of events) {
    const list = byRevision.get(e.revisionId) ?? [];
    list.push(e);
    byRevision.set(e.revisionId, list);
  }

  return (
    <div className="grid gap-3">
      {revisions.map((rev, i) => {
        const isLatest = i === 0;
        const head = (
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="mono text-[13px] font-semibold">{formatDrawingRevision(rev.number)}</span>
            <DrawingStatusBadge status={rev.status} />
            <span className="pill">{isLatest ? "Current" : "Locked"}</span>
            {!readOnly && !rev.bomImpact && rev.number > 1 && <span className="pill">No BOM change</span>}
            <span className="spacer" />
            <span className="muted text-[12px]">{(byRevision.get(rev.id) ?? []).filter(e => e.kind === "comment").length} comments</span>
          </div>
        );
        const body = (
          <RevisionCard
            rev={rev}
            events={byRevision.get(rev.id) ?? []}
            file={files.find(f => f.revisionId === rev.id)}
            drawingCode={drawingCode}
            isLatest={isLatest}
            readOnly={readOnly}
          />
        );
        return isLatest ? (
          <div key={rev.id} className="card">
            <div className="card-head">{head}</div>
            {body}
          </div>
        ) : (
          <details key={rev.id} className="card">
            <summary className="card-head cursor-pointer list-none">{head}</summary>
            {body}
          </details>
        );
      })}
    </div>
  );
}
