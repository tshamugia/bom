import type { revisionStatusEnum } from "@/db/schema/enums";

export type RevisionStatus = (typeof revisionStatusEnum.enumValues)[number];

export function isRevisionImmutable(status: RevisionStatus): boolean {
  return status !== "draft";
}

export function isRevisionProcurementEligible(status: RevisionStatus): boolean {
  return status !== "draft";
}
