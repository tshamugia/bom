import { beforeEach, expect, test, vi } from "vitest";
import { resetDb } from "@/../tests/test-helpers/db";
import { mockSession } from "@/../tests/test-helpers/auth";
import { db } from "@/db/client";
import {
  vendors, categories, items, projects, bomRevisions, bomLines,
  approvalWorkflows, approvalSteps, auditLog,
} from "@/db/schema";
import { getStats, getRecentActivity } from "@/server/queries/dashboard";

vi.mock("@/server/auth-context", () => ({ requireSession: vi.fn(), requireRole: vi.fn() }));

beforeEach(async () => { await resetDb(); });

async function setup() {
  const { user: u } = await mockSession();

  const [v] = await db.insert(vendors).values({ name: "M", code: "M", country: "US", leadTime: "3d", rating: 4, status: "approved" }).returning();
  const [c] = await db.insert(categories).values({ name: "C" }).returning();
  const [it1] = await db.insert(items).values({ sku: "OK", description: "ok", manufacturer: "y", unit: "pcs", vendorId: v.id, categoryId: c.id, subcategoryId: null }).returning();

  const [p1] = await db.insert(projects).values({ code: "A", name: "A", status: "in-progress" }).returning();
  await db.insert(projects).values({ code: "B", name: "B", status: "approved" }).returning();
  const [r1] = await db.insert(bomRevisions).values({ projectId: p1.id, letter: "A", status: "in-progress" }).returning();
  await db.insert(bomLines).values({ revisionId: r1.id, itemId: it1.id, qty: 5, position: 0 });

  const [wf] = await db.insert(approvalWorkflows).values({ revisionId: r1.id, status: "pending", currentStepIndex: 0 }).returning();
  await db.insert(approvalSteps).values({ workflowId: wf.id, position: 0, role: "Engineering", status: "active" });

  await db.insert(auditLog).values([
    { actorId: u.id, kind: "approval.requested", summary: "A sent for review", refType: "workflow", refId: wf.id, createdAt: new Date("2026-04-30T10:00:00Z") },
    { actorId: u.id, kind: "vendor.created",     summary: "M added",            refType: "vendor",   refId: v.id, createdAt: new Date("2026-04-30T11:00:00Z") },
  ]);
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
