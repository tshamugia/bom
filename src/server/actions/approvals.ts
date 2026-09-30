"use server";

import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import {
  approvalWorkflows, approvalSteps, boms, bomRevisions,
} from "@/db/schema";
import { EDITOR_ROLES, isAdmin } from "@/lib/roles";
import { requireRole } from "../auth-context";
import { audit } from "../audit";

const DEFAULT_STAGES: Array<{ role: string }> = [
  { role: "Engineering" },
  { role: "Procurement" },
  { role: "Finance" },
];

const RevisionInput = z.object({ revisionId: z.string().min(1) });
const WorkflowInput = z.object({ workflowId: z.string().min(1) });
const DecisionInput = WorkflowInput.extend({ note: z.string().trim().max(2000).optional() });

async function loadRevision(revisionId: string) {
  await requireRole(...EDITOR_ROLES);
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
      requestedById: approvalWorkflows.requestedById,
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

type Workflow = NonNullable<Awaited<ReturnType<typeof loadWorkflow>>>;
type Step = typeof approvalSteps.$inferSelect;

/** The open workflow and its active stage; throws when there is nothing to decide. */
async function loadOpenStage(workflowId: string) {
  const w = await loadWorkflow(workflowId);
  if (!w) throw new Error("WORKFLOW_NOT_FOUND");
  if (w.status !== "pending") throw new Error("WORKFLOW_CLOSED");
  const steps = await db
    .select()
    .from(approvalSteps)
    .where(eq(approvalSteps.workflowId, w.id))
    .orderBy(asc(approvalSteps.position));
  const active = steps[w.currentStepIndex];
  if (!active) throw new Error("NO_ACTIVE_STEP");
  return { w, steps, active };
}

/** A stage assigned to someone is theirs to decide. */
function assertAssignee(userId: string, active: Step) {
  if (active.assigneeId && active.assigneeId !== userId) throw new Error("NOT_ASSIGNEE");
}

/**
 * Four eyes: whoever asked for the approval can't sign it off, and one person
 * approves at most one stage — otherwise a single member could walk a BOM
 * through Engineering, Procurement and Finance alone.
 */
function assertMayApprove(userId: string, w: Workflow, steps: Step[], active: Step) {
  if (w.requestedById === userId) throw new Error("REQUESTER_CANNOT_APPROVE");
  assertAssignee(userId, active);
  if (steps.some(s => s.id !== active.id && s.decidedById === userId)) throw new Error("ALREADY_APPROVED_A_STAGE");
}

/** Only move a workflow that is still pending at the stage we checked — a concurrent decision wins. */
const stillAt = (w: Workflow) =>
  and(
    eq(approvalWorkflows.id, w.id),
    eq(approvalWorkflows.status, "pending"),
    eq(approvalWorkflows.currentStepIndex, w.currentStepIndex),
  );

export async function requestApproval(input: { revisionId: string }) {
  const { revisionId } = RevisionInput.parse(input);
  const rev = await loadRevision(revisionId);
  if (rev.status !== "committed") throw new Error("REVISION_NOT_COMMITTED");
  const session = await requireRole(...EDITOR_ROLES);

  const workflow = await db.transaction(async tx => {
    // Claim the revision first so two requests can't both open a workflow.
    const [claimed] = await tx
      .update(bomRevisions)
      .set({ status: "review", updatedAt: new Date() })
      .where(and(eq(bomRevisions.id, rev.id), eq(bomRevisions.status, "committed")))
      .returning({ id: bomRevisions.id });
    if (!claimed) throw new Error("REVISION_NOT_COMMITTED");

    const [w] = await tx.insert(approvalWorkflows).values({
      revisionId: rev.id,
      status: "pending",
      currentStepIndex: 0,
      requestedById: session.user.id,
    }).returning();

    await tx.insert(approvalSteps).values(
      DEFAULT_STAGES.map((s, idx) => ({
        workflowId: w.id,
        position: idx,
        role: s.role,
        status: idx === 0 ? "active" as const : "pending" as const,
      })),
    );
    return w;
  });

  revalidatePath("/approvals");
  revalidatePath("/dashboard");
  revalidatePath(`/preview/${rev.projectId}/${rev.bomId}`);
  await audit({ kind: "approval.requested", refType: "workflow", refId: workflow.id, summary: `Rev sent for review` });
  return workflow;
}

export async function approveStep(input: { workflowId: string; note?: string }) {
  const { workflowId, note } = DecisionInput.parse(input);
  const session = await requireRole(...EDITOR_ROLES);

  const { w, steps, active } = await loadOpenStage(workflowId);
  assertMayApprove(session.user.id, w, steps, active);

  const nextIdx = w.currentStepIndex + 1;
  const isLast = nextIdx >= steps.length;
  const now = new Date();

  await db.transaction(async tx => {
    const [moved] = await tx
      .update(approvalWorkflows)
      .set(isLast ? { status: "approved", closedAt: now } : { currentStepIndex: nextIdx })
      .where(stillAt(w))
      .returning({ id: approvalWorkflows.id });
    if (!moved) throw new Error("WORKFLOW_CHANGED");

    await tx.update(approvalSteps).set({
      status: "approved",
      decidedById: session.user.id,
      decidedAt: now,
      decisionNote: note || null,
    }).where(eq(approvalSteps.id, active.id));

    if (isLast) {
      await tx.update(bomRevisions).set({ status: "locked", lockedAt: now, updatedAt: now }).where(eq(bomRevisions.id, w.revisionId));
    } else {
      await tx.update(approvalSteps).set({ status: "active" }).where(eq(approvalSteps.id, steps[nextIdx].id));
    }
  });

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
  const { workflowId, note } = DecisionInput.parse(input);
  const session = await requireRole(...EDITOR_ROLES);

  const { w, active } = await loadOpenStage(workflowId);
  assertAssignee(session.user.id, active);
  const now = new Date();

  await db.transaction(async tx => {
    const [moved] = await tx
      .update(approvalWorkflows)
      .set({ status: "rejected", closedAt: now })
      .where(stillAt(w))
      .returning({ id: approvalWorkflows.id });
    if (!moved) throw new Error("WORKFLOW_CHANGED");

    await tx.update(approvalSteps).set({
      status: "rejected",
      decidedById: session.user.id,
      decidedAt: now,
      decisionNote: note || null,
    }).where(eq(approvalSteps.id, active.id));
    await tx.update(bomRevisions).set({ status: "in-progress", updatedAt: now }).where(eq(bomRevisions.id, w.revisionId));
  });

  revalidatePath("/approvals");
  revalidatePath("/dashboard");
  revalidatePath(`/preview/${w.projectId}/${w.bomId}`);
  await audit({ kind: "approval.rejected", refType: "workflow", refId: w.id, summary: `${active.role} rejected${note ? `: ${note}` : ""}` });
}

/** Only an open workflow, and only by whoever requested it or an admin — a finished approval stays finished. */
export async function cancelWorkflow(input: { workflowId: string }) {
  const { workflowId } = WorkflowInput.parse(input);
  const session = await requireRole(...EDITOR_ROLES);
  const w = await loadWorkflow(workflowId);
  if (!w) throw new Error("WORKFLOW_NOT_FOUND");
  if (w.status !== "pending") throw new Error("WORKFLOW_CLOSED");
  if (w.requestedById !== session.user.id && !isAdmin(session.user)) throw new Error("FORBIDDEN");
  const now = new Date();

  await db.transaction(async tx => {
    const [moved] = await tx
      .update(approvalWorkflows)
      .set({ status: "cancelled", closedAt: now })
      .where(and(eq(approvalWorkflows.id, w.id), eq(approvalWorkflows.status, "pending")))
      .returning({ id: approvalWorkflows.id });
    if (!moved) throw new Error("WORKFLOW_CHANGED");
    await tx.update(bomRevisions).set({ status: "in-progress", updatedAt: now }).where(eq(bomRevisions.id, w.revisionId));
  });

  revalidatePath("/approvals");
  revalidatePath("/dashboard");
  await audit({ kind: "approval.cancelled", refType: "workflow", refId: w.id, summary: "Approval workflow cancelled", payload: { revisionId: w.revisionId } });
}
