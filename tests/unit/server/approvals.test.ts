import { beforeEach, expect, test, vi } from "vitest";
import { resetDb } from "@/../tests/test-helpers/db";
import { mockSession } from "@/../tests/test-helpers/auth";
import { db } from "@/db/client";
import { eq } from "drizzle-orm";
import { items, vendors, categories, projects, boms, bomRevisions, bomLines, approvalWorkflows, approvalSteps } from "@/db/schema";
import { requestApproval, approveStep, rejectStep } from "@/server/actions/approvals";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/auth-context", () => ({ requireSession: vi.fn(), requireRole: vi.fn() }));

beforeEach(async () => { await resetDb(); });

async function setup() {
  const { user: u } = await mockSession();

  const [v] = await db.insert(vendors).values({ name: "M", code: "M", country: "US", leadTime: "3d", rating: 4, status: "approved" }).returning();
  const [c] = await db.insert(categories).values({ name: "C" }).returning();
  const [it] = await db.insert(items).values({ sku: "X", description: "x", manufacturer: "Y", unit: "pcs", vendorId: v.id, categoryId: c.id, subcategoryId: null }).returning();
  const [p] = await db.insert(projects).values({ code: "P", name: "P" }).returning();
  const [b] = await db.insert(boms).values({ projectId: p.id, name: "Main BOM" }).returning();
  const [r] = await db.insert(bomRevisions).values({ bomId: b.id, letter: "A", status: "committed" }).returning();
  await db.insert(bomLines).values({ revisionId: r.id, itemId: it.id, qty: 1, position: 0 });
  return { projectId: p.id, bomId: b.id, revisionId: r.id, userId: u.id };
}

test("requestApproval creates a workflow with three default steps", async () => {
  const { revisionId } = await setup();
  const w = await requestApproval({ revisionId });
  const steps = await db.select().from(approvalSteps).where(eq(approvalSteps.workflowId, w.id));
  expect(steps).toHaveLength(3);
  expect(steps.map(s => s.role).sort()).toEqual(["Engineering", "Finance", "Procurement"]);
  const active = steps.find(s => s.position === 0)!;
  expect(active.status).toBe("active");
});

test("approveStep advances the workflow and the last step locks the revision", async () => {
  const { revisionId } = await setup();
  const w = await requestApproval({ revisionId });

  await approveStep({ workflowId: w.id });
  let updated = (await db.select().from(approvalWorkflows).where(eq(approvalWorkflows.id, w.id)))[0];
  expect(updated.currentStepIndex).toBe(1);
  expect(updated.status).toBe("pending");

  await approveStep({ workflowId: w.id });
  await approveStep({ workflowId: w.id });
  updated = (await db.select().from(approvalWorkflows).where(eq(approvalWorkflows.id, w.id)))[0];
  expect(updated.status).toBe("approved");

  const [rev] = await db.select().from(bomRevisions).where(eq(bomRevisions.id, revisionId));
  expect(rev.status).toBe("locked");
  expect(rev.lockedAt).not.toBeNull();
});

test("requestApproval rejects a draft revision", async () => {
  const { revisionId } = await setup();
  await db.update(bomRevisions).set({ status: "draft" }).where(eq(bomRevisions.id, revisionId));
  await expect(requestApproval({ revisionId })).rejects.toThrow(/NOT_COMMITTED/);
});

test("requestApproval rejects a locked revision", async () => {
  const { revisionId } = await setup();
  await db.update(bomRevisions).set({ status: "locked" }).where(eq(bomRevisions.id, revisionId));
  await expect(requestApproval({ revisionId })).rejects.toThrow(/NOT_COMMITTED/);
});

test("rejectStep ends the workflow and sets revision back to in-progress", async () => {
  const { revisionId } = await setup();
  const w = await requestApproval({ revisionId });
  await rejectStep({ workflowId: w.id, note: "needs work" });

  const [updated] = await db.select().from(approvalWorkflows).where(eq(approvalWorkflows.id, w.id));
  expect(updated.status).toBe("rejected");

  const [rev] = await db.select().from(bomRevisions).where(eq(bomRevisions.id, revisionId));
  expect(rev.status).toBe("in-progress");
});
