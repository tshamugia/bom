"use server";

import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import {
  approvalWorkflows, approvalSteps, boms, bomRevisions,
} from "@/db/schema";
import { requireSession } from "../auth-context";
import { audit } from "../audit";

const DEFAULT_STAGES: Array<{ role: string }> = [
  { role: "Engineering" },
  { role: "Procurement" },
  { role: "Finance" },
];

async function loadRevision(revisionId: string) {
  await requireSession();
  const [row] = await db
    .select({
      id: bomRevisions.id,
      bomId: bomRevisions.bomId,
      projectId: boms.projectId,
      status: bomRevisions.status,
    })
    .from(bomRevisions)
    .innerJoin(boms, eq(boms.id, bomRevisions.bomId))
    .where(eq(bomRevisions.id, revisionId))
    .limit(1);
  if (!row) throw new Error("REVISION_NOT_FOUND");
  return row;
}

async function loadWorkflow(workflowId: string) {
  const [w] = await db
    .select({
      id: approvalWorkflows.id,
      currentStepIndex: approvalWorkflows.currentStepIndex,
      revisionId: approvalWorkflows.revisionId,
      bomId: bomRevisions.bomId,
      projectId: boms.projectId,
      status: approvalWorkflows.status,
    })
    .from(approvalWorkflows)
    .innerJoin(bomRevisions, eq(bomRevisions.id, approvalWorkflows.revisionId))
    .innerJoin(boms, eq(boms.id, bomRevisions.bomId))
    .where(eq(approvalWorkflows.id, workflowId))
    .limit(1);
  return w ?? null;
}

export async function requestApproval(input: { revisionId: string }) {
  const rev = await loadRevision(input.revisionId);
  if (rev.status !== "committed") throw new Error("REVISION_NOT_COMMITTED");
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

  await db.update(bomRevisions).set({ status: "review", updatedAt: new Date() }).where(eq(bomRevisions.id, rev.id));

  revalidatePath("/approvals");
  revalidatePath("/dashboard");
  revalidatePath(`/preview/${rev.projectId}/${rev.bomId}`);
  await audit({ kind: "approval.requested", refType: "workflow", refId: workflow.id, summary: `Rev sent for review` });
  return workflow;
}

export async function approveStep(input: { workflowId: string; note?: string }) {
  const session = await requireSession();

  const w = await loadWorkflow(input.workflowId);
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
    await db.update(bomRevisions).set({ status: "locked", lockedAt: new Date(), updatedAt: new Date() }).where(eq(bomRevisions.id, w.revisionId));
  } else {
    await db.update(approvalWorkflows).set({ currentStepIndex: nextIdx }).where(eq(approvalWorkflows.id, w.id));
    await db.update(approvalSteps).set({ status: "active" }).where(eq(approvalSteps.id, steps[nextIdx].id));
  }

  revalidatePath("/approvals");
  revalidatePath("/dashboard");
  revalidatePath(`/preview/${w.projectId}/${w.bomId}`);
  await audit({
    kind: "approval.approved",
    refType: "workflow", refId: w.id,
    summary: `${active.role} approved${isLast ? " — workflow complete" : ""}`,
  });
}

export async function rejectStep(input: { workflowId: string; note?: string }) {
  const session = await requireSession();

  const w = await loadWorkflow(input.workflowId);
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
  await db.update(bomRevisions).set({ status: "in-progress", updatedAt: new Date() }).where(eq(bomRevisions.id, w.revisionId));

  revalidatePath("/approvals");
  revalidatePath("/dashboard");
  revalidatePath(`/preview/${w.projectId}/${w.bomId}`);
  await audit({ kind: "approval.rejected", refType: "workflow", refId: w.id, summary: `${active.role} rejected${input.note ? `: ${input.note}` : ""}` });
}

export async function cancelWorkflow(input: { workflowId: string }) {
  await requireSession();
  const w = await loadWorkflow(input.workflowId);
  if (!w) throw new Error("WORKFLOW_NOT_FOUND");

  await db.update(approvalWorkflows).set({ status: "cancelled", closedAt: new Date() }).where(eq(approvalWorkflows.id, w.id));
  await db.update(bomRevisions).set({ status: "in-progress" }).where(eq(bomRevisions.id, w.revisionId));
  revalidatePath("/approvals");
  revalidatePath("/dashboard");
}
