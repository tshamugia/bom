import { beforeEach, expect, test, vi } from "vitest";
import { resetDb, ensureOrg } from "@/../tests/test-helpers/db";
import { db } from "@/db/client";
import { items, vendors, categories, projects, bomRevisions, bomLines, user } from "@/db/schema";
import { generateExport } from "@/server/actions/exports";
import { listExports } from "@/server/queries/exports";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/org", () => ({ getCurrentOrgId: vi.fn(), requireSession: vi.fn() }));
import { getCurrentOrgId, requireSession } from "@/server/org";

vi.mock("@/lib/s3", () => ({
  putObject: vi.fn(async (key: string) => ({ key, bucket: "mock" })),
  presignDownload: vi.fn(async (key: string) => `https://mock/${key}`),
}));
import { putObject } from "@/lib/s3";

beforeEach(async () => {
  await resetDb();
  vi.mocked(putObject).mockClear();
});

async function setup() {
  const org = await ensureOrg();
  vi.mocked(getCurrentOrgId).mockResolvedValue(org.id);

  const [u] = await db.insert(user).values({ id: "u1", name: "U", email: "u@example.com", emailVerified: true }).returning();
  vi.mocked(requireSession).mockResolvedValue({ user: { id: u.id, name: u.name, email: u.email } } as any);

  const [v] = await db.insert(vendors).values({ name: "M", code: "M", country: "US", leadTime: "3d", rating: 4, status: "approved", organizationId: org.id }).returning();
  const [c] = await db.insert(categories).values({ name: "C", organizationId: org.id }).returning();
  const [it] = await db.insert(items).values({ sku: "X-1", description: "x", manufacturer: "Y", unit: "pcs", unitPrice: "1.000", onHand: 10, stockState: "in-stock", vendorId: v.id, categoryId: c.id, subcategoryId: null, organizationId: org.id }).returning();

  const [p] = await db.insert(projects).values({ organizationId: org.id, code: "TST", name: "Test", status: "in-progress", quantity: 5 }).returning();
  const [r] = await db.insert(bomRevisions).values({ projectId: p.id, letter: "A", status: "in-progress" }).returning();
  await db.insert(bomLines).values({ revisionId: r.id, itemId: it.id, qty: 4, unitPriceSnapshot: "1.000", position: 0 });

  return { orgId: org.id, projectId: p.id, revisionId: r.id, userId: u.id };
}

test("generateExport uploads to S3 and persists a row", async () => {
  const { revisionId, userId } = await setup();
  const ex = await generateExport({
    revisionId,
    options: { includeVendorPricing: true, includeStockAvailability: true, groupByVendor: false, includeCoverPage: false },
  });
  expect(ex.id).toBeTruthy();
  expect(ex.fileName).toMatch(/^BOM_TST_Rev_A\.xlsx$/);
  expect(putObject).toHaveBeenCalledOnce();

  const list = await listExports();
  expect(list).toHaveLength(1);
  expect(list[0].generatedById).toBe(userId);
});
