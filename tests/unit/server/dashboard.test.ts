import { beforeEach, expect, test, vi } from "vitest";
import { resetDb, ensureOrg } from "@/../tests/test-helpers/db";
import { db } from "@/db/client";
import {
  user, vendors, categories, items, projects, bomRevisions, bomLines,
  approvalWorkflows, approvalSteps, auditLog,
} from "@/db/schema";
import { getStats, getRecentActivity } from "@/server/queries/dashboard";

vi.mock("@/server/org", () => ({ getCurrentOrgId: vi.fn() }));
import { getCurrentOrgId } from "@/server/org";

beforeEach(async () => { await resetDb(); });

async function setup() {
  const org = await ensureOrg();
  vi.mocked(getCurrentOrgId).mockResolvedValue(org.id);

  const [u] = await db.insert(user).values({ id: "u1", name: "U", email: "u@example.com", emailVerified: true }).returning();
  const [v] = await db.insert(vendors).values({ name: "M", code: "M", country: "US", leadTime: "3d", rating: 4, status: "approved", organizationId: org.id }).returning();
  const [c] = await db.insert(categories).values({ name: "C", organizationId: org.id }).returning();
  const [it1] = await db.insert(items).values({ sku: "OK", description: "ok", manufacturer: "y", unit: "pcs", vendorId: v.id, categoryId: c.id, subcategoryId: null, organizationId: org.id }).returning();

  const [p1] = await db.insert(projects).values({ organizationId: org.id, code: "A", name: "A", status: "in-progress" }).returning();
  const [p2] = await db.insert(projects).values({ organizationId: org.id, code: "B", name: "B", status: "approved" }).returning();
  const [r1] = await db.insert(bomRevisions).values({ projectId: p1.id, letter: "A", status: "in-progress" }).returning();
  await db.insert(bomLines).values({ revisionId: r1.id, itemId: it1.id, qty: 5, position: 0 });

  const [wf] = await db.insert(approvalWorkflows).values({ revisionId: r1.id, status: "pending", currentStepIndex: 0 }).returning();
  await db.insert(approvalSteps).values({ workflowId: wf.id, position: 0, role: "Engineering", status: "active" });

  await db.insert(auditLog).values([
    { organizationId: org.id, actorId: u.id, kind: "approval.requested", summary: "A sent for review", refType: "workflow", refId: wf.id, createdAt: new Date("2026-04-30T10:00:00Z") },
    { organizationId: org.id, actorId: u.id, kind: "vendor.created",     summary: "M added",            refType: "vendor",   refId: v.id, createdAt: new Date("2026-04-30T11:00:00Z") },
  ]);
  return { orgId: org.id };
}

test("getStats returns counts", async () => {
  await setup();
  const s = await getStats();
  expect(s.activeBoms).toBe(1);
  expect(s.approvalsPending).toBe(1);
});

test("getRecentActivity returns latest first", async () => {
  await setup();
  const list = await getRecentActivity(8);
  expect(list).toHaveLength(2);
  expect(list[0].summary).toBe("M added");
  expect(list[1].summary).toBe("A sent for review");
});

