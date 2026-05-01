import { beforeEach, expect, test, vi } from "vitest";
import { resetDb, ensureOrg } from "@/../tests/test-helpers/db";
import { db } from "@/db/client";
import { eq } from "drizzle-orm";
import { items, vendors, categories, projects, bomRevisions, bomLines, user, approvalWorkflows, approvalSteps } from "@/db/schema";
import { requestApproval, approveStep, rejectStep } from "@/server/actions/approvals";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/org", () => ({ getCurrentOrgId: vi.fn(), requireSession: vi.fn() }));
import { getCurrentOrgId, requireSession } from "@/server/org";

beforeEach(async () => { await resetDb(); });

async function setup() {
  const org = await ensureOrg();
  vi.mocked(getCurrentOrgId).mockResolvedValue(org.id);
  const [u] = await db.insert(user).values({ id: "u1", name: "U", email: "u@example.com", emailVerified: true }).returning();
  vi.mocked(requireSession).mockResolvedValue({ user: { id: u.id, name: u.name, email: u.email } } as any);

  const [v] = await db.insert(vendors).values({ name: "M", code: "M", country: "US", leadTime: "3d", rating: 4, status: "approved", organizationId: org.id }).returning();
  const [c] = await db.insert(categories).values({ name: "C", organizationId: org.id }).returning();
  const [it] = await db.insert(items).values({ sku: "X", description: "x", manufacturer: "Y", unit: "pcs", unitPrice: "1.000", onHand: 1, stockState: "in-stock", vendorId: v.id, categoryId: c.id, subcategoryId: null, organizationId: org.id }).returning();
  const [p] = await db.insert(projects).values({ organizationId: org.id, code: "P", name: "P", status: "in-progress" }).returning();
  const [r] = await db.insert(bomRevisions).values({ projectId: p.id, letter: "A", status: "in-progress" }).returning();
  await db.insert(bomLines).values({ revisionId: r.id, itemId: it.id, qty: 1, unitPriceSnapshot: "1.000", position: 0 });
  return { orgId: org.id, projectId: p.id, revisionId: r.id, userId: u.id };
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

test("approveStep advances the workflow and the last step approves the project", async () => {
  const { revisionId, projectId } = await setup();
  const w = await requestApproval({ revisionId });

  await approveStep({ workflowId: w.id });
  let updated = (await db.select().from(approvalWorkflows).where(eq(approvalWorkflows.id, w.id)))[0];
  expect(updated.currentStepIndex).toBe(1);
  expect(updated.status).toBe("pending");

  await approveStep({ workflowId: w.id });
  await approveStep({ workflowId: w.id });
  updated = (await db.select().from(approvalWorkflows).where(eq(approvalWorkflows.id, w.id)))[0];
  expect(updated.status).toBe("approved");

  const [proj] = await db.select().from(projects).where(eq(projects.id, projectId));
  expect(proj.status).toBe("approved");

  const [rev] = await db.select().from(bomRevisions).where(eq(bomRevisions.id, revisionId));
  expect(rev.status).toBe("locked");
  expect(rev.lockedAt).not.toBeNull();
});

test("rejectStep ends the workflow and sets project back to in-progress", async () => {
  const { revisionId, projectId } = await setup();
  const w = await requestApproval({ revisionId });
  await rejectStep({ workflowId: w.id, note: "needs work" });

  const [updated] = await db.select().from(approvalWorkflows).where(eq(approvalWorkflows.id, w.id));
  expect(updated.status).toBe("rejected");

  const [proj] = await db.select().from(projects).where(eq(projects.id, projectId));
  expect(proj.status).toBe("in-progress");
});
