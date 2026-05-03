import Link from "next/link";
import { Badge, RevisionStatusBadge } from "@/components/ui/badge";
import { CommitDialog } from "@/components/builder/commit-dialog";
import { DiscardDraftButton } from "@/components/builder/discard-draft-button";
import { BranchRevisionButton } from "@/components/builder/branch-revision-button";

export type RevisionHeaderProps = {
  projectId: string;
  projectCode: string;
  projectName: string;
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
};

export function RevisionHeader(p: RevisionHeaderProps) {
  const { revision: r } = p;
  const isDraft = r.status === "draft";

  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        <div className="flex items-center gap-2.5">
          <h1 className="text-[20px] font-semibold tracking-tight">{p.projectName}</h1>
          <span className="rounded-full bg-[var(--color-surface-3)] px-2 py-px font-mono text-[11px] text-[var(--color-text-2)]">{p.projectCode}</span>
          <RevisionStatusBadge status={r.status} />
          <Badge tone="gray">Rev {r.letter}</Badge>
        </div>
        <div className="mt-1 text-[12px] text-[var(--color-text-3)]">
          {isDraft ? (
            <>
              Owner: {r.ownerName ?? "—"}
              {r.parentLetter ? <> · Branched from Rev {r.parentLetter}</> : null}
            </>
          ) : (
            <>
              Committed by {r.committedByName ?? "—"}
              {r.committedAt ? <> · {new Date(r.committedAt).toLocaleString()}</> : null}
              {r.commitMessage ? <> · <em>&ldquo;{r.commitMessage}&rdquo;</em></> : null}
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Link href={`/projects/${p.projectId}/history`} className="text-[12px] text-[var(--color-text-2)] hover:underline">History</Link>
        {isDraft ? (
          <>
            <DiscardDraftButton revisionId={r.id} projectId={p.projectId} />
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
          <BranchRevisionButton parentRevisionId={r.id} projectId={p.projectId} hasOpenDraft={p.hasOpenDraft} />
        )}
      </div>
    </div>
  );
}
