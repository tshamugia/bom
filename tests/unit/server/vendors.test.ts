import { beforeEach, expect, test, vi } from "vitest";
import { resetDb, ensureOrg } from "@/../tests/test-helpers/db";
import { db } from "@/db/client";
import { vendors } from "@/db/schema";
import { listVendors, vendorStats } from "@/server/queries/vendors";
import { createVendor, updateVendor, deleteVendor } from "@/server/actions/vendors";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/server/org", () => ({
  getCurrentOrgId: vi.fn(),
  requireSession: vi.fn(),
}));

import { getCurrentOrgId } from "@/server/org";

beforeEach(async () => {
  await resetDb();
});

test("createVendor / listVendors / vendorStats happy path", async () => {
  const org = await ensureOrg();
  vi.mocked(getCurrentOrgId).mockResolvedValue(org.id);

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
  const org = await ensureOrg();
  vi.mocked(getCurrentOrgId).mockResolvedValue(org.id);

  const v = await createVendor({ name: "Old", code: "OLD", country: "US", leadTime: "3d", rating: 4, status: "approved" });
  await updateVendor({ id: v.id, name: "New" });
  const list = await listVendors();
  expect(list[0].name).toBe("New");
});

test("deleteVendor removes the row", async () => {
  const org = await ensureOrg();
  vi.mocked(getCurrentOrgId).mockResolvedValue(org.id);

  const v = await createVendor({ name: "X", code: "X", country: "US", leadTime: "3d", rating: 4, status: "approved" });
  await deleteVendor({ id: v.id });
  const remaining = await db.select().from(vendors);
  expect(remaining).toHaveLength(0);
});
