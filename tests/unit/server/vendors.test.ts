import { beforeEach, expect, test, vi } from "vitest";
import { resetDb } from "@/../tests/test-helpers/db";
import { mockSession } from "@/../tests/test-helpers/auth";
import { db } from "@/db/client";
import { auditLog, vendors } from "@/db/schema";
import { listVendors, vendorStats } from "@/server/queries/vendors";
import { createVendor, updateVendor, deleteVendor } from "@/server/actions/vendors";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/auth-context", () => ({
  requireSession: vi.fn(),
  requireRole: vi.fn(),
}));

beforeEach(async () => {
  await resetDb();
});

test("createVendor / listVendors / vendorStats happy path", async () => {
  await mockSession();

  await createVendor({ name: "Mouser", code: "MSR", country: "US", leadTime: "3-5d", rating: 4.8, status: "preferred" });
  await createVendor({ name: "DigiSource", code: "DGS", country: "US", leadTime: "2-4d", rating: 4.7, status: "preferred" });
  await createVendor({ name: "Arrow", code: "ARW", country: "US", leadTime: "5-7d", rating: 4.5, status: "approved" });

  const list = await listVendors();
  expect(list).toHaveLength(3);
  expect(list.map(v => v.name).sort()).toEqual(["Arrow", "DigiSource", "Mouser"]);

  const stats = await vendorStats();
  expect(stats.total).toBe(3);
  expect(stats.preferred).toBe(2);
  expect(Math.round(stats.avgRating * 10) / 10).toBe(4.7);
});

test("updateVendor changes the name", async () => {
  await mockSession();

  const v = await createVendor({ name: "Old", code: "OLD", country: "US", leadTime: "3d", rating: 4, status: "approved" });
  await updateVendor({ id: v.id, name: "New" });
  const list = await listVendors();
  expect(list[0].name).toBe("New");
});

test("deleteVendor removes the row", async () => {
  await mockSession();

  const v = await createVendor({ name: "X", code: "X", country: "US", leadTime: "3d", rating: 4, status: "approved" });
  await deleteVendor({ id: v.id });
  const remaining = await db.select().from(vendors);
  expect(remaining).toHaveLength(0);
});

test("members can't delete vendors; an admin delete is audited", async () => {
  await mockSession("member");
  const v = await createVendor({ name: "Keep", code: "KEEP", country: "US", leadTime: "3d", rating: 4, status: "approved" });
  await expect(deleteVendor({ id: v.id })).rejects.toThrow(/FORBIDDEN/);
  expect(await db.select().from(vendors)).toHaveLength(1);

  await mockSession("admin");
  await deleteVendor({ id: v.id });
  const kinds = (await db.select({ kind: auditLog.kind }).from(auditLog)).map(r => r.kind);
  expect(kinds).toContain("vendor.deleted");
});

test("updateVendor is audited", async () => {
  await mockSession("member");
  const v = await createVendor({ name: "A", code: "A", country: "US", leadTime: "3d", rating: 4, status: "approved" });
  await updateVendor({ id: v.id, name: "B" });
  const rows = await db.select().from(auditLog);
  expect(rows.find(r => r.kind === "vendor.updated")?.summary).toBe("Vendor B updated");
});
