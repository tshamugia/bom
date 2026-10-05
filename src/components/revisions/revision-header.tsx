import Link from "next/link";
import { Badge, RevisionStatusBadge } from "@/components/ui/badge";
import { CommitDialog } from "@/components/builder/commit-dialog";
import { DiscardDraftButton } from "@/components/builder/discard-draft-button";
import { BranchRevisionDialog, type BomOwnerOption } from "@/components/revisions/branch-revision-dialog";
import { InlineProjectName } from "@/components/builder/inline-project-name";
import { BomSwitcher, type SwitcherBom } from "@/components/builder/bom-switcher";
import { formatDateTime } from "@/lib/format";
import { HelpTip } from "@/components/help/help-tip";

export type RevisionHeaderProps = {
  projectId: string;
  projectCode: string;
  projectName: string;
  bomId: string;
  bomName: string;
  revision: {
    id: string;
    letter: string;
    status: "draft" | "committed" | "in-progress" | "review" | "approved" | "locked";
    ownerName: string | null;
    committedByName: string | null;
    committedAt: Date | null;
    commitMessage: string | null;
    parentLetter: string | null;
  };
  preflight?: { lineCount: number; vendorCount: number; hasZeroQty: boolean };
  hasOpenDraft: boolean;
  bomsInProject?: SwitcherBom[];
  /** The BOM's current owner — it changes only with a new revision. */
  bomOwner: { id: string | null; name: string | null };
  owners: BomOwnerOption[];
};

export function RevisionHeader(p: RevisionHeaderProps) {
  const { revision: r } = p;
  const isDraft = r.status === "draft";

  return (
    <div className="mb-5 flex items-start justify-between gap-4 max-[701px]:flex-col max-[701px]:gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <InlineProjectName key={p.projectName} projectId={p.projectId} initialName={p.projectName} />
          <span className="rounded-[var(--r-1)] bg-[var(--color-surface-3)] px-1.5 py-px font-mono text-[11px] text-[var(--color-text-2)]">{p.projectCode}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          {p.bomsInProject ? (
            <BomSwitcher
              projectId={p.projectId}
              currentBomId={p.bomId}
              currentBomName={p.bomName}
              boms={p.bomsInProject}
            />
          ) : (
            <Link
              href={`/projects/${p.projectId}`}
              className="text-[14px] font-medium text-[var(--color-text-2)] hover:underline"
            >
              {p.bomName}
            </Link>
          )}
          <RevisionStatusBadge status={r.status} />
          <Badge tone="gray">Rev {r.letter}</Badge>
          <HelpTip topic="bom-revisions" />
        </div>
        <div className="mt-1 text-[12px] text-[var(--color-text-3)] [overflow-wrap:anywhere]">
          {isDraft ? (
            <>
              Owner: {r.ownerName ?? "—"}
              {r.parentLetter ? <> · Branched from Rev {r.parentLetter}</> : null}
            </>
          ) : (
            <>
              Owner: {r.ownerName ?? "—"} · Committed by {r.committedByName ?? "—"}
              {r.committedAt ? <> · {formatDateTime(r.committedAt)}</> : null}
              {r.commitMessage ? <> · <em>&ldquo;{r.commitMessage}&rdquo;</em></> : null}
            </>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/projects/${p.projectId}/history`} className="text-[12px] text-[var(--color-text-2)] hover:underline">History</Link>
        {isDraft ? (
          <>
            <DiscardDraftButton revisionId={r.id} projectId={p.projectId} bomId={p.bomId} />
            {p.preflight && (
              <CommitDialog
                revisionId={r.id}
                letter={r.letter}
                lineCount={p.preflight.lineCount}
                vendorCount={p.preflight.vendorCount}
                hasZeroQty={p.preflight.hasZeroQty}
              />
            )}
          </>
        ) : (
          <BranchRevisionDialog
            variant="new"
            parentRevisionId={r.id}
            parentLetter={r.letter}
            projectId={p.projectId}
            bomId={p.bomId}
            hasOpenDraft={p.hasOpenDraft}
            owner={p.bomOwner}
            owners={p.owners}
          />
        )}
      </div>
    </div>
  );
}
