"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";
import { DrawingStatusBadge } from "@/components/drawings/drawing-status-badge";
import { formatDrawingRevision } from "@/lib/drawing-status";
import {
  linkDrawingsToBom, unlinkDrawingFromBom, updateBomDrawingLinks,
} from "@/server/actions/bom-drawing-links";
import type { DrawingLinkRow, LinkableDrawing } from "@/server/queries/drawing-control";

const isOutdated = (l: DrawingLinkRow) => l.linkedRevisionNumber < l.latestRevisionNumber;

function ManageDialog({
  bomRevisionId,
  links,
  linkable,
}: {
  bomRevisionId: string;
  links: DrawingLinkRow[];
  linkable: LinkableDrawing[];
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const router = useRouter();

  const linkedIds = new Set(links.map(l => l.drawingId));
  const candidates = linkable.filter(d => !linkedIds.has(d.id));

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done?: string) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error ?? "Something went wrong");
        return;
      }
      if (done) toast.success(done);
      router.refresh();
    });

  const addPicked = () =>
    run(async () => {
      const res = await linkDrawingsToBom({ bomRevisionId, drawingIds: picked });
      if (res.ok) setPicked([]);
      return res;
    }, `${picked.length} drawing${picked.length === 1 ? "" : "s"} linked`);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button type="button" className="btn btn-sm">
            <Icon.Link className="ico" /> Manage
          </button>
        }
      />
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Drawings for this revision</DialogTitle>
          <DialogDescription>
            A drawing is linked at its current revision. When the drawing gets a newer revision, this BOM shows it as outdated.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <div className="field-label">Linked</div>
            {links.length === 0 && <div className="muted text-[12.5px]">Nothing linked yet.</div>}
            {links.map(l => (
              <div key={l.linkId} className="flex items-center gap-2 rounded-md border border-[var(--color-line)] px-2.5 py-1.5 text-[12.5px]">
                <span className="mono font-semibold">{l.code}</span>
                <span className="min-w-0 flex-1 truncate">{l.name}</span>
                <span className="mono">{formatDrawingRevision(l.linkedRevisionNumber)}</span>
                {isOutdated(l) && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={pending}
                    onClick={() =>
                      run(() => updateBomDrawingLinks({ bomRevisionId, linkIds: [l.linkId] }), `${l.code} updated`)
                    }
                  >
                    Update to {formatDrawingRevision(l.latestRevisionNumber)}
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-ghost btn-sm btn-icon"
                  aria-label={`Unlink ${l.code}`}
                  disabled={pending}
                  onClick={() => run(() => unlinkDrawingFromBom({ linkId: l.linkId }))}
                >
                  <Icon.X className="ico" />
                </button>
              </div>
            ))}
          </div>

          <div className="grid gap-1.5">
            <div className="field-label">Add from this project</div>
            {candidates.length === 0 ? (
              <div className="muted text-[12.5px]">
                {linkable.length === 0 ? "This project has no drawings yet." : "Every drawing of this project is linked."}
              </div>
            ) : (
              <div className="grid max-h-60 gap-0.5 overflow-auto rounded-md border border-[var(--color-line)] p-1">
                {candidates.map(d => (
                  <label key={d.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-[12.5px] hover:bg-[var(--color-surface-2)]">
                    <input
                      type="checkbox"
                      checked={picked.includes(d.id)}
                      onChange={e =>
                        setPicked(prev => (e.target.checked ? [...prev, d.id] : prev.filter(id => id !== d.id)))
                      }
                    />
                    <span className="mono font-semibold">{d.code}</span>
                    <span className="min-w-0 flex-1 truncate">{d.name}</span>
                    <span className="mono muted">{formatDrawingRevision(d.revisionNumber)}</span>
                    <DrawingStatusBadge status={d.status} />
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
          <Button onClick={addPicked} disabled={pending || picked.length === 0}>
            Link {picked.length || ""} drawing{picked.length === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The drawing revisions this BOM revision is built from, with outdated ones flagged. */
export function BomDrawingsStrip({
  bomRevisionId,
  isDraft,
  links,
  linkable,
}: {
  bomRevisionId: string;
  isDraft: boolean;
  links: DrawingLinkRow[];
  linkable: LinkableDrawing[];
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const outdated = links.filter(isOutdated);

  const updateAll = () =>
    start(async () => {
      const res = await updateBomDrawingLinks({ bomRevisionId });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${res.updated} drawing reference${res.updated === 1 ? "" : "s"} updated`);
      router.refresh();
    });

  return (
    <div
      className="card mb-4 flex flex-wrap items-center gap-2 px-4 py-2.5"
      style={outdated.length ? { borderColor: "var(--red)" } : undefined}
    >
      <Icon.Drawing className="ico" style={{ color: "var(--text-3)", width: 15, height: 15 }} />
      <span className="text-[12.5px] font-semibold">Drawings</span>
      {links.length === 0 && (
        <span className="muted text-[12.5px]">
          {isDraft ? "None linked — link the drawings this BOM is built from." : "None linked."}
        </span>
      )}
      {links.map(l => (
        <Link
          key={l.linkId}
          href={`/drawings/${l.drawingId}`}
          className="pill"
          style={isOutdated(l) ? { borderColor: "var(--red)", color: "var(--red)" } : { color: "inherit" }}
          title={`${l.name}${isOutdated(l) ? ` — ${formatDrawingRevision(l.latestRevisionNumber)} is available` : ""}`}
        >
          <span className="mono">{l.code}</span> {formatDrawingRevision(l.linkedRevisionNumber)}
          {isOutdated(l) && <> → {formatDrawingRevision(l.latestRevisionNumber)}</>}
          {l.deleted && <span className="muted"> (archived)</span>}
        </Link>
      ))}
      <span className="spacer" />
      {outdated.length > 0 && (
        <span className="text-[12px]" style={{ color: "var(--red)", fontWeight: 600 }}>
          {outdated.length} outdated{!isDraft && " — branch a new revision to update"}
        </span>
      )}
      {isDraft && outdated.length > 0 && (
        <button type="button" className="btn btn-sm" disabled={pending} onClick={updateAll}>
          Update all
        </button>
      )}
      {isDraft && <ManageDialog bomRevisionId={bomRevisionId} links={links} linkable={linkable} />}
    </div>
  );
}
