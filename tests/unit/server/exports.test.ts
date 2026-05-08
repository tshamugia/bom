import { beforeEach, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";
import { resetDb } from "@/../tests/test-helpers/db";
import { mockSession } from "@/../tests/test-helpers/auth";
import { db } from "@/db/client";
import { items, vendors, categories, projects, boms, bomRevisions, bomLines } from "@/db/schema";
import { generateExport } from "@/server/actions/exports";
import { listExports } from "@/server/queries/exports";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/auth-context", () => ({ requireSession: vi.fn(), requireRole: vi.fn() }));

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
  const { user: u } = await mockSession();

  const [v] = await db.insert(vendors).values({ name: "M", code: "M", country: "US", leadTime: "3d", rating: 4, status: "approved" }).returning();
  const [c] = await db.insert(categories).values({ name: "C" }).returning();
  const [it] = await db.insert(items).values({ sku: "X-1", description: "x", manufacturer: "Y", unit: "pcs", vendorId: v.id, categoryId: c.id, subcategoryId: null }).returning();

  const [p] = await db.insert(projects).values({ code: "TST", name: "Test", quantity: 5 }).returning();
  const [b] = await db.insert(boms).values({ projectId: p.id, name: "Main BOM" }).returning();
  const [r] = await db.insert(bomRevisions).values({ bomId: b.id, letter: "A", status: "in-progress" }).returning();
  await db.insert(bomLines).values({
    revisionId: r.id,
    itemId: it.id,
    qty: 4,
    skuSnapshot: it.sku,
    descriptionSnapshot: it.description,
    manufacturerSnapshot: it.manufacturer,
    unitSnapshot: it.unit,
    vendorNameSnapshot: v.name,
    position: 0,
  });

  return { projectId: p.id, revisionId: r.id, userId: u.id };
}

function defaultOptions() {
  return {
    columns: {
      sku: true,
      description: true,
      manufacturer: true,
      vendor: true,
      unit: true,
      qty: true,
    },
    groupByVendor: false,
    includeCoverPage: false,
  };
}

test("generateExport uploads to S3 and persists a row", async () => {
  const { revisionId, userId } = await setup();
  const ex = await generateExport({
    revisionId,
    options: defaultOptions(),
  });
  expect(ex.id).toBeTruthy();
  expect(ex.fileName).toMatch(/^BOM_TST_Rev_A\.xlsx$/);
  expect(putObject).toHaveBeenCalledOnce();

  const list = await listExports();
  expect(list).toHaveLength(1);
  expect(list[0].generatedById).toBe(userId);
});

test("generateExport on draft revision records revisionStatusAtExport=draft", async () => {
  const { revisionId } = await setup();
  await db.update(bomRevisions).set({ status: "draft" }).where(eq(bomRevisions.id, revisionId));
  const row = await generateExport({ revisionId, options: defaultOptions() });
  expect(row.revisionStatusAtExport).toBe("draft");
  expect(row.fileName).toMatch(/^BOM_TST_Rev_A_DRAFT_\d{4}-\d{2}-\d{2}\.xlsx$/);
});

test("generateExport on committed revision records revisionStatusAtExport=committed", async () => {
  const { revisionId } = await setup();
  await db.update(bomRevisions).set({ status: "committed" }).where(eq(bomRevisions.id, revisionId));
  const row = await generateExport({ revisionId, options: defaultOptions() });
  expect(row.revisionStatusAtExport).toBe("committed");
});
