"use server";

import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import {
  approvalWorkflows, approvalSteps, bomRevisions, projects,
} from "@/db/schema";
import { getCurrentOrgId, requireSession } from "../org";
import { audit } from "../audit";

const DEFAULT_STAGES: Array<{ role: string }> = [
  { role: "Engineering" },
  { role: "Procurement" },
  { role: "Finance" },
];

async function ensureRevisionInOrg(revisionId: string) {
  const orgId = await getCurrentOrgId();
  const [row] = await db
    .select({ id: bomRevisions.id, projectId: bomRevisions.projectId, status: bomRevisions.status })
    .from(bomRevisions)
    .innerJoin(projects, eq(projects.id, bomRevisions.projectId))
    .where(and(eq(bomRevisions.id, revisionId), eq(projects.organizationId, orgId)))
    .limit(1);
  if (!row) throw new Error("REVISION_NOT_FOUND");
  return row;
}

export async function requestApproval(input: { revisionId: string }) {
  const rev = await ensureRevisionInOrg(input.revisionId);
  if (rev.status === "locked") throw new Error("REVISION_LOCKED");
  const session = await requireSession();

  const [workflow] = await db.insert(approvalWorkflows).values({
    revisionId: rev.id,
    status: "pending",
    currentStepIndex: 0,
    requestedById: session.user.id,
  }).returning();

  await db.insert(approvalSteps).values(
    DEFAULT_STAGES.map((s, idx) => ({
      workflowId: workflow.id,
      position: idx,
      role: s.role,
      status: idx === 0 ? "active" as const : "pending" as const,
    })),
  );

  await db.update(projects).set({ status: "review", updatedAt: new Date() }).where(eq(projects.id, rev.projectId));
  await db.update(bomRevisions).set({ status: "review", updatedAt: new Date() }).where(eq(bomRevisions.id, rev.id));

  revalidatePath("/approvals");
  revalidatePath("/dashboard");
  revalidatePath(`/preview/${rev.projectId}`);
  await audit({ kind: "approval.requested", refType: "workflow", refId: workflow.id, summary: `${rev.projectId} sent for review` });
  return workflow;
}

export async function approveStep(input: { workflowId: string; note?: string }) {
  const orgId = await getCurrentOrgId();
  const session = await requireSession();

  const [w] = await db
    .select({ id: approvalWorkflows.id, currentStepIndex: approvalWorkflows.currentStepIndex, revisionId: approvalWorkflows.revisionId, projectId: bomRevisions.projectId, status: approvalWorkflows.status })
    .from(approvalWorkflows)
    .innerJoin(bomRevisions, eq(bomRevisions.id, approvalWorkflows.revisionId))
    .innerJoin(projects, eq(projects.id, bomRevisions.projectId))
    .where(and(eq(approvalWorkflows.id, input.workflowId), eq(projects.organizationId, orgId)))
    .limit(1);
  if (!w) throw new Error("WORKFLOW_NOT_FOUND");
  if (w.status !== "pending") throw new Error("WORKFLOW_CLOSED");

  const steps = await db
    .select()
    .from(approvalSteps)
    .where(eq(approvalSteps.workflowId, w.id))
    .orderBy(asc(approvalSteps.position));
  const active = steps[w.currentStepIndex];
  if (!active) throw new Error("NO_ACTIVE_STEP");

  await db.update(approvalSteps).set({
    status: "approved",
    decidedById: session.user.id,
    decidedAt: new Date(),
    decisionNote: input.note,
  }).where(eq(approvalSteps.id, active.id));

  const nextIdx = w.currentStepIndex + 1;
  const isLast = nextIdx >= steps.length;

  if (isLast) {
    await db.update(approvalWorkflows).set({ status: "approved", closedAt: new Date() }).where(eq(approvalWorkflows.id, w.id));
    await db.update(projects).set({ status: "approved", updatedAt: new Date() }).where(eq(projects.id, w.projectId));
    await db.update(bomRevisions).set({ status: "locked", lockedAt: new Date(), updatedAt: new Date() }).where(eq(bomRevisions.id, w.revisionId));
  } else {
    await db.update(approvalWorkflows).set({ currentStepIndex: nextIdx }).where(eq(approvalWorkflows.id, w.id));
    await db.update(approvalSteps).set({ status: "active" }).where(eq(approvalSteps.id, steps[nextIdx].id));
  }

  revalidatePath("/approvals");
  revalidatePath("/dashboard");
  revalidatePath(`/preview/${w.projectId}`);
  await audit({
    kind: "approval.approved",
    refType: "workflow", refId: w.id,
    summary: `${active.role} approved${isLast ? " — workflow complete" : ""}`,
  });
}

export async function rejectStep(input: { workflowId: string; note?: string }) {
  const orgId = await getCurrentOrgId();
  const session = await requireSession();

  const [w] = await db
    .select({ id: approvalWorkflows.id, currentStepIndex: approvalWorkflows.currentStepIndex, revisionId: approvalWorkflows.revisionId, projectId: bomRevisions.projectId, status: approvalWorkflows.status })
    .from(approvalWorkflows)
    .innerJoin(bomRevisions, eq(bomRevisions.id, approvalWorkflows.revisionId))
    .innerJoin(projects, eq(projects.id, bomRevisions.projectId))
    .where(and(eq(approvalWorkflows.id, input.workflowId), eq(projects.organizationId, orgId)))
    .limit(1);
  if (!w) throw new Error("WORKFLOW_NOT_FOUND");
  if (w.status !== "pending") throw new Error("WORKFLOW_CLOSED");

  const steps = await db.select().from(approvalSteps).where(eq(approvalSteps.workflowId, w.id)).orderBy(asc(approvalSteps.position));
  const active = steps[w.currentStepIndex];

  await db.update(approvalSteps).set({
    status: "rejected",
    decidedById: session.user.id,
    decidedAt: new Date(),
    decisionNote: input.note,
  }).where(eq(approvalSteps.id, active.id));
  await db.update(approvalWorkflows).set({ status: "rejected", closedAt: new Date() }).where(eq(approvalWorkflows.id, w.id));
  await db.update(projects).set({ status: "in-progress", updatedAt: new Date() }).where(eq(projects.id, w.projectId));
  await db.update(bomRevisions).set({ status: "in-progress", updatedAt: new Date() }).where(eq(bomRevisions.id, w.revisionId));

  revalidatePath("/approvals");
  revalidatePath("/dashboard");
  revalidatePath(`/preview/${w.projectId}`);
  await audit({ kind: "approval.rejected", refType: "workflow", refId: w.id, summary: `${active.role} rejected${input.note ? `: ${input.note}` : ""}` });
}

export async function cancelWorkflow(input: { workflowId: string }) {
  const orgId = await getCurrentOrgId();
  const [w] = await db
    .select({ id: approvalWorkflows.id, projectId: bomRevisions.projectId, revisionId: approvalWorkflows.revisionId })
    .from(approvalWorkflows)
    .innerJoin(bomRevisions, eq(bomRevisions.id, approvalWorkflows.revisionId))
    .innerJoin(projects, eq(projects.id, bomRevisions.projectId))
    .where(and(eq(approvalWorkflows.id, input.workflowId), eq(projects.organizationId, orgId)))
    .limit(1);
  if (!w) throw new Error("WORKFLOW_NOT_FOUND");

  await db.update(approvalWorkflows).set({ status: "cancelled", closedAt: new Date() }).where(eq(approvalWorkflows.id, w.id));
  await db.update(projects).set({ status: "in-progress" }).where(eq(projects.id, w.projectId));
  await db.update(bomRevisions).set({ status: "in-progress" }).where(eq(bomRevisions.id, w.revisionId));
  revalidatePath("/approvals");
  revalidatePath("/dashboard");
}
