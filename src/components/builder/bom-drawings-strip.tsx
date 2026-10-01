"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";
import { DrawingStatusBadge } from "@/components/drawings/drawing-status-badge";
import { HelpTip } from "@/components/help/help-tip";
import { formatDrawingRevision } from "@/lib/drawing-status";
import {
  confirmNoBomChange, linkDrawingsToBom, unlinkDrawingFromBom, updateBomDrawingLinks,
} from "@/server/actions/bom-drawing-links";
import type { DrawingLinkRow, LinkableDrawing } from "@/server/queries/drawing-control";

type ActionResult = { ok: boolean; error?: string };

/** Runs an action, toasts the outcome and refreshes the page on success. */
function useRunAction() {
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<ActionResult>, done?: string, onDone?: () => void) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error ?? "Something went wrong");
        return;
      }
      if (done) toast.success(done);
      onDone?.();
      router.refresh();
    });
  return { pending, run };
}

/** A newer drawing revision exists but none of them changes the BOM, or someone checked them. */
const isBehindButCurrent = (l: DrawingLinkRow) => !l.outdated && l.latestRevisionNumber > l.linkedRevisionNumber;

function pillTitle(l: DrawingLinkRow): string {
  const latest = formatDrawingRevision(l.latestRevisionNumber);
  if (l.outdated) return `${l.name} — ${latest} changes the BOM`;
  if (isBehindButCurrent(l)) {
    const checked = l.checkedRevisionNumber
      ? ` Checked against ${formatDrawingRevision(l.checkedRevisionNumber)}${l.checkedByName ? ` by ${l.checkedByName}` : ""}.`
      : "";
    return `${l.name} — no BOM change through ${latest}.${checked}`;
  }
  return l.name;
}

function ReviewDialog({
  bomRevisionId,
  isDraft,
  outdated,
}: {
  bomRevisionId: string;
  isDraft: boolean;
  outdated: DrawingLinkRow[];
}) {
  const [open, setOpen] = useState(false);
  const { pending, run } = useRunAction();

  // Close first when nothing will be left, since the trigger unmounts once the list is empty.
  const closeIfLast = (count: number) => () => { if (count >= outdated.length) setOpen(false); };

  const confirm = (rows: DrawingLinkRow[]) =>
    run(
      () => confirmNoBomChange({
        bomRevisionId,
        checks: rows.map(l => ({ linkId: l.linkId, drawingRevisionId: l.latestRevisionId })),
      }),
      `${rows.length === 1 ? rows[0].code : `${rows.length} drawings`} checked — no BOM change`,
      closeIfLast(rows.length),
    );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<button type="button" className="btn btn-sm">Review</button>} />
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Outdated drawings</DialogTitle>
          <DialogDescription>
            These drawings have a newer revision that changes the BOM. If this BOM doesn&apos;t need to change,
            mark it — the BOM keeps its revision and stops showing as outdated.
            {!isDraft && " To change the BOM itself, create a new revision."}{" "}
            <HelpTip topic="no-bom-change" />
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          {outdated.map(l => (
            <div key={l.linkId} className="grid gap-1.5 rounded-md border border-[var(--color-line)] px-2.5 py-2 text-[12.5px]">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/drawings/${l.drawingId}`} className="mono font-semibold" style={{ color: "inherit" }}>
                  {l.code}
                </Link>
                <span className="min-w-0 flex-1 truncate">{l.name}</span>
                <span className="mono" style={{ color: "var(--red)" }}>
                  {formatDrawingRevision(l.linkedRevisionNumber)} → {formatDrawingRevision(l.latestRevisionNumber)}
                </span>
              </div>
              {l.newerRevisions.length > 0 && (
                <ul className="grid gap-0.5">
                  {l.newerRevisions.map(r => (
                    <li key={r.number} className="flex gap-2">
                      <span className="mono shrink-0">{formatDrawingRevision(r.number)}</span>
                      <span className="min-w-0 flex-1 italic text-[var(--color-text-2)] [overflow-wrap:anywhere]">
                        {r.commitMessage}
                      </span>
                      {!r.bomImpact && <span className="muted shrink-0">no BOM change</span>}
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                {isDraft && (
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={pending}
                    onClick={() =>
                      run(
                        () => updateBomDrawingLinks({ bomRevisionId, linkIds: [l.linkId] }),
                        `${l.code} updated`,
                        closeIfLast(1),
                      )
                    }
                  >
                    Update to {formatDrawingRevision(l.latestRevisionNumber)}
                  </button>
                )}
                <button type="button" className="btn btn-sm" disabled={pending} onClick={() => confirm([l])}>
                  <Icon.Check className="ico" /> No BOM change
                </button>
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
          {outdated.length > 1 && (
            <Button onClick={() => confirm(outdated)} disabled={pending}>No BOM change for all</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
  const { pending, run } = useRunAction();

  const linkedIds = new Set(links.map(l => l.drawingId));
  const candidates = linkable.filter(d => !linkedIds.has(d.id));

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
            A drawing is linked at its current revision. When the drawing gets a newer revision that changes the BOM,
            this BOM shows it as outdated.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <div className="field-label">Linked</div>
            {links.length === 0 && <div className="muted text-[12.5px]">Nothing linked yet.</div>}
            {links.map(l => (
              <div key={l.linkId} className="flex items-center gap-2 rounded-md border border-[var(--color-line)] px-2.5 py-1.5 text-[12.5px] max-[480px]:flex-wrap">
                <span className="mono font-semibold">{l.code}</span>
                <span className="min-w-0 flex-1 truncate max-[480px]:order-last max-[480px]:basis-full">{l.name}</span>
                <span className="mono max-[480px]:ml-auto">{formatDrawingRevision(l.linkedRevisionNumber)}</span>
                {l.latestRevisionNumber > l.linkedRevisionNumber && (
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
                  <label key={d.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-[12.5px] hover:bg-[var(--color-surface-2)] max-[480px]:flex-wrap max-[480px]:gap-y-0.5">
                    <input
                      type="checkbox"
                      checked={picked.includes(d.id)}
                      onChange={e =>
                        setPicked(prev => (e.target.checked ? [...prev, d.id] : prev.filter(id => id !== d.id)))
                      }
                    />
                    <span className="mono font-semibold">{d.code}</span>
                    <span className="min-w-0 flex-1 truncate max-[480px]:order-last max-[480px]:basis-full max-[480px]:pl-6">{d.name}</span>
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

/**
 * The drawing revisions this BOM revision is built from. Outdated ones (a newer
 * revision changes the BOM) are flagged and can be reviewed — even on a
 * committed revision, a "no BOM change" check clears them without branching.
 */
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
  const { pending, run } = useRunAction();
  const outdated = links.filter(l => l.outdated);

  const updateAll = () =>
    run(async () => {
      const res = await updateBomDrawingLinks({ bomRevisionId });
      if (res.ok) toast.success(`${res.updated} drawing reference${res.updated === 1 ? "" : "s"} updated`);
      return res;
    });

  return (
    <div
      className="card mb-4 flex flex-wrap items-center gap-2 px-4 py-2.5"
      style={outdated.length ? { borderColor: "var(--red)" } : undefined}
    >
      <Icon.Drawing className="ico" style={{ color: "var(--text-3)", width: 15, height: 15 }} />
      <span className="text-[12.5px] font-semibold">Drawings</span>
      <HelpTip topic="bom-drawings" />
      {links.length === 0 && (
        <span className="muted text-[12.5px]">
          {isDraft
            ? "None linked — link the drawings this BOM is built from."
            : "None linked. Drawings are linked on a draft revision."}
        </span>
      )}
      {links.map(l => (
        <Link
          key={l.linkId}
          href={`/drawings/${l.drawingId}`}
          className="pill"
          style={l.outdated ? { borderColor: "var(--red)", color: "var(--red)" } : { color: "inherit" }}
          title={pillTitle(l)}
        >
          <span className="mono">{l.code}</span> {formatDrawingRevision(l.linkedRevisionNumber)}
          {l.outdated && <> → {formatDrawingRevision(l.latestRevisionNumber)}</>}
          {isBehindButCurrent(l) && (
            <span className="muted"> ✓ {formatDrawingRevision(l.latestRevisionNumber)}</span>
          )}
          {l.deleted && <span className="muted"> (archived)</span>}
        </Link>
      ))}
      <span className="spacer" />
      {outdated.length > 0 && (
        <span className="text-[12px]" style={{ color: "var(--red)", fontWeight: 600 }}>
          {outdated.length} outdated
        </span>
      )}
      {outdated.length > 0 && <ReviewDialog bomRevisionId={bomRevisionId} isDraft={isDraft} outdated={outdated} />}
      {isDraft && outdated.length > 0 && (
        <button type="button" className="btn btn-sm" disabled={pending} onClick={updateAll}>
          Update all
        </button>
      )}
      {isDraft && <ManageDialog bomRevisionId={bomRevisionId} links={links} linkable={linkable} />}
    </div>
  );
}
