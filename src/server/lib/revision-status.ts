import { sql, type SQLWrapper } from "drizzle-orm";
import { approvalWorkflows } from "@/db/schema/approvals";
import type { RevisionStatus } from "@/lib/bom-status";

export type { RevisionStatus };

export function isRevisionImmutable(status: RevisionStatus): boolean {
  return status !== "draft";
}

export function isRevisionProcurementEligible(status: RevisionStatus): boolean {
  return status !== "draft";
}

/**
 * Whether the revision was emailed to procurement. Every send opens an
 * approval workflow, and the status alone can't tell: an approved revision may
 * or may not have gone out.
 */
export function revisionSentSql(revisionId: SQLWrapper) {
  return sql<boolean>`exists (select 1 from ${approvalWorkflows} where ${approvalWorkflows.revisionId} = ${revisionId})`;
}
