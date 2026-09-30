import { beforeEach, expect, test, vi } from "vitest";
import { resetDb } from "@/../tests/test-helpers/db";
import { mockSession } from "@/../tests/test-helpers/auth";
import { db } from "@/db/client";
import { eq } from "drizzle-orm";
import { items, vendors, categories, projects, boms, bomRevisions, bomLines, approvalWorkflows, approvalSteps } from "@/db/schema";
import { requestApproval, approveStep, rejectStep, cancelWorkflow } from "@/server/actions/approvals";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/auth-context", () => ({ requireSession: vi.fn(), requireRole: vi.fn() }));

beforeEach(async () => { await resetDb(); });

async function setup() {
  const [v] = await db.insert(vendors).values({ name: "M", code: "M", country: "US", leadTime: "3d", rating: 4, status: "approved" }).returning();
  const [c] = await db.insert(categories).values({ name: "C" }).returning();
  const [it] = await db.insert(items).values({ sku: "X", description: "x", manufacturer: "Y", unit: "pcs", vendorId: v.id, categoryId: c.id, subcategoryId: null }).returning();
  const [p] = await db.insert(projects).values({ code: "P", name: "P" }).returning();
  const [b] = await db.insert(boms).values({ projectId: p.id, name: "Main BOM" }).returning();
  const [r] = await db.insert(bomRevisions).values({ bomId: b.id, letter: "A", status: "committed" }).returning();
  await db.insert(bomLines).values({ revisionId: r.id, itemId: it.id, qty: 1, position: 0 });
  return { projectId: p.id, bomId: b.id, revisionId: r.id };
}

/** A member asks for the approval; each later `mockSession` call signs in as someone else. */
async function requested() {
  const ids = await setup();
  const { user: requester } = await mockSession("member");
  const w = await requestApproval({ revisionId: ids.revisionId });
  return { ...ids, w, requester };
}

const workflow = async (id: string) => (await db.select().from(approvalWorkflows).where(eq(approvalWorkflows.id, id)))[0];
const revision = async (id: string) => (await db.select().from(bomRevisions).where(eq(bomRevisions.id, id)))[0];

test("requestApproval creates a workflow with three default steps", async () => {
  const { w } = await requested();
  const steps = await db.select().from(approvalSteps).where(eq(approvalSteps.workflowId, w.id));
  expect(steps).toHaveLength(3);
  expect(steps.map(s => s.role).sort()).toEqual(["Engineering", "Finance", "Procurement"]);
  const active = steps.find(s => s.position === 0)!;
  expect(active.status).toBe("active");
});

test("approveStep advances the workflow and the last step locks the revision", async () => {
  const { w, revisionId } = await requested();

  await mockSession("member");
  await approveStep({ workflowId: w.id });
  let updated = await workflow(w.id);
  expect(updated.currentStepIndex).toBe(1);
  expect(updated.status).toBe("pending");

  await mockSession("member");
  await approveStep({ workflowId: w.id });
  await mockSession("admin");
  await approveStep({ workflowId: w.id });
  updated = await workflow(w.id);
  expect(updated.status).toBe("approved");

  const rev = await revision(revisionId);
  expect(rev.status).toBe("locked");
  expect(rev.lockedAt).not.toBeNull();
});

test("whoever requested the approval can't approve it", async () => {
  const { w } = await requested();
  await expect(approveStep({ workflowId: w.id })).rejects.toThrow(/REQUESTER_CANNOT_APPROVE/);
  expect((await workflow(w.id)).currentStepIndex).toBe(0);
});

test("one person approves at most one stage", async () => {
  const { w } = await requested();
  await mockSession("member");
  await approveStep({ workflowId: w.id });
  await expect(approveStep({ workflowId: w.id })).rejects.toThrow(/ALREADY_APPROVED_A_STAGE/);
  expect((await workflow(w.id)).currentStepIndex).toBe(1);
});

test("a stage assigned to someone is only theirs to decide", async () => {
  const { w } = await requested();
  const { user: assignee } = await mockSession("member");
  await db.update(approvalSteps).set({ assigneeId: assignee.id }).where(eq(approvalSteps.workflowId, w.id));

  await mockSession("member");
  await expect(approveStep({ workflowId: w.id })).rejects.toThrow(/NOT_ASSIGNEE/);
  await expect(rejectStep({ workflowId: w.id })).rejects.toThrow(/NOT_ASSIGNEE/);
});

test("viewers can't decide", async () => {
  const { w } = await requested();
  await mockSession("viewer");
  await expect(approveStep({ workflowId: w.id })).rejects.toThrow(/FORBIDDEN/);
});

test("a revision can't be sent for approval twice at once", async () => {
  const { revisionId } = await setup();
  await mockSession("member");
  const results = await Promise.allSettled([requestApproval({ revisionId }), requestApproval({ revisionId })]);
  expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  expect(await db.select().from(approvalWorkflows)).toHaveLength(1);
});

test("requestApproval rejects a draft revision", async () => {
  const { revisionId } = await setup();
  await mockSession("member");
  await db.update(bomRevisions).set({ status: "draft" }).where(eq(bomRevisions.id, revisionId));
  await expect(requestApproval({ revisionId })).rejects.toThrow(/NOT_COMMITTED/);
});

test("requestApproval rejects a locked revision", async () => {
  const { revisionId } = await setup();
  await mockSession("member");
  await db.update(bomRevisions).set({ status: "locked" }).where(eq(bomRevisions.id, revisionId));
  await expect(requestApproval({ revisionId })).rejects.toThrow(/NOT_COMMITTED/);
});

test("rejectStep ends the workflow and sets revision back to in-progress", async () => {
  const { w, revisionId } = await requested();
  await mockSession("member");
  await rejectStep({ workflowId: w.id, note: "needs work" });

  expect((await workflow(w.id)).status).toBe("rejected");
  expect((await revision(revisionId)).status).toBe("in-progress");
});

test("only the requester or an admin cancels, and only while pending", async () => {
  const { w, revisionId } = await requested();

  await mockSession("member");
  await expect(cancelWorkflow({ workflowId: w.id })).rejects.toThrow(/FORBIDDEN/);

  await mockSession("admin");
  await cancelWorkflow({ workflowId: w.id });
  expect((await workflow(w.id)).status).toBe("cancelled");
  expect((await revision(revisionId)).status).toBe("in-progress");
});

test("an approved workflow can't be cancelled back open", async () => {
  const { w, revisionId } = await requested();
  for (const role of ["member", "member", "admin"] as const) {
    await mockSession(role);
    await approveStep({ workflowId: w.id });
  }

  await expect(cancelWorkflow({ workflowId: w.id })).rejects.toThrow(/WORKFLOW_CLOSED/);
  expect((await revision(revisionId)).status).toBe("locked");
});
