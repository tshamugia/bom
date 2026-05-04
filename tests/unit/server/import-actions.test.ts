import { beforeEach, expect, test, vi } from "vitest";
import ExcelJS from "exceljs";
import { resetDb, ensureOrg } from "@/../tests/test-helpers/db";
import { db } from "@/db/client";
import { vendors, categories, subcategories, auditLog, items, user } from "@/db/schema";
import { eq } from "drizzle-orm";
import { TEMPLATE_COLUMNS } from "@/lib/schemas/import";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/org", () => ({
  getCurrentOrgId: vi.fn(),
  requireSession: vi.fn(),
}));
vi.mock("@/lib/s3", async () => {
  const actual = await vi.importActual<typeof import("@/lib/s3")>("@/lib/s3");
  const store = new Map<string, Buffer>();
  return {
    ...actual,
    putObject: vi.fn(async (key: string, body: Buffer) => { store.set(key, body); return { key, bucket: "test" }; }),
    getStagingBuffer: vi.fn(async (key: string) => store.get(key) ?? null),
    deleteObject: vi.fn(async (key: string) => { store.delete(key); }),
    presignDownload: vi.fn(async () => "https://signed.example/x"),
    __store: store,
  };
});

import { getCurrentOrgId, requireSession } from "@/server/org";
import { prepareImport, commitImport } from "@/server/actions/import";
import { getDryRun } from "@/server/queries/import";

beforeEach(async () => { await resetDb(); });

async function makeFile(rows: (string | number)[][], headers: string[] = [...TEMPLATE_COLUMNS]): Promise<File> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("items");
  ws.addRow(headers);
  for (const r of rows) ws.addRow(r);
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  return new File([buf], "catalog.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

test("prepareImport returns dry-run result with counts and auto-creates", async () => {
  const org = await ensureOrg();
  vi.mocked(getCurrentOrgId).mockResolvedValue(org.id);
  vi.mocked(requireSession).mockResolvedValue({ user: { id: "u1" } } as never);

  await db.insert(vendors).values({ name: "Mouser", code: "MSR", country: "US", leadTime: "3-5d", rating: 4.8, status: "approved", organizationId: org.id });
  const [cat] = await db.insert(categories).values({ name: "Passive", organizationId: org.id }).returning();
  await db.insert(subcategories).values({ name: "Resistors", categoryId: cat.id });

  const fd = new FormData();
  fd.set("file", await makeFile([
    ["RES-1", "10k",  "Yageo", "pcs", "MSR",   "Passive", "Resistors"],
    ["NEW-1", "100u", "TDK",   "pcs", "NEWCO", "Sensors", "Pressure"],
  ]));
  const r = await prepareImport(fd);

  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.result.counts).toMatchObject({ total: 2, toAdd: 2, toUpdate: 0, errored: 0 });
  expect(r.result.newVendors).toEqual(["NEWCO"]);
  expect(r.result.newCategories).toEqual(["Sensors"]);
  expect(r.result.newSubcategories).toEqual([{ category: "Sensors", subcategory: "Pressure" }]);
});

test("prepareImport rejects header mismatch", async () => {
  const org = await ensureOrg();
  vi.mocked(getCurrentOrgId).mockResolvedValue(org.id);
  vi.mocked(requireSession).mockResolvedValue({ user: { id: "u1" } } as never);

  const fd = new FormData();
  fd.set("file", await makeFile([], ["sku", "qty"]));
  const r = await prepareImport(fd);
  expect(r.ok).toBe(false);
  if (r.ok) return;
  expect(r.error).toBe("header_mismatch");
});

test("prepareImport rejects oversize file", async () => {
  const org = await ensureOrg();
  vi.mocked(getCurrentOrgId).mockResolvedValue(org.id);
  vi.mocked(requireSession).mockResolvedValue({ user: { id: "u1" } } as never);

  const big = Buffer.alloc(11 * 1024 * 1024); // 11 MB
  const fd = new FormData();
  fd.set("file", new File([big], "big.xlsx"));
  const r = await prepareImport(fd);
  expect(r.ok).toBe(false);
  if (r.ok) return;
  expect(r.error).toBe("too_large");
});

test("getDryRun re-derives the result from the staged S3 file", async () => {
  const org = await ensureOrg();
  vi.mocked(getCurrentOrgId).mockResolvedValue(org.id);
  vi.mocked(requireSession).mockResolvedValue({ user: { id: "u1" } } as never);

  const fd = new FormData();
  fd.set("file", await makeFile([
    ["A", "d", "m", "pcs", "", "", ""],
  ]));
  const prep = await prepareImport(fd);
  if (!prep.ok) throw new Error("prepare failed");

  const r = await getDryRun(prep.result.importId);
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.result.counts.toAdd).toBe(1);
});

test("getDryRun returns expired when file is gone", async () => {
  const org = await ensureOrg();
  vi.mocked(getCurrentOrgId).mockResolvedValue(org.id);
  vi.mocked(requireSession).mockResolvedValue({ user: { id: "u1" } } as never);
  const r = await getDryRun("nonexistent-id");
  expect(r.ok).toBe(false);
  if (r.ok) return;
  expect(r.error).toBe("expired");
});

async function setupOrgWithUser() {
  const org = await ensureOrg();
  const [u] = await db.insert(user).values({ id: `u-${org.id.slice(0, 6)}`, name: "U", email: `u-${org.id}@example.com`, emailVerified: true }).returning();
  vi.mocked(getCurrentOrgId).mockResolvedValue(org.id);
  vi.mocked(requireSession).mockResolvedValue({ user: { id: u.id, name: u.name, email: u.email } } as never);
  return { org, user: u };
}

test("commitImport (skip duplicates): inserts new items, leaves existing untouched, creates vendors/categories", async () => {
  const { org } = await setupOrgWithUser();

  const [v] = await db.insert(vendors).values({ name: "Mouser", code: "MSR", country: "US", leadTime: "3d", rating: 4, status: "approved", organizationId: org.id }).returning();
  await db.insert(items).values({
    organizationId: org.id,
    sku: "OLD-1", description: "old desc", manufacturer: "old mfr",
    unit: "pcs",
    vendorId: v.id, categoryId: null, subcategoryId: null,
  });

  const fd = new FormData();
  fd.set("file", await makeFile([
    ["OLD-1", "NEW DESC",  "NEW MFR", "pcs", "MSR",   "",        ""],
    ["NEW-1", "something", "TDK",     "pcs", "NEWCO", "Sensors", "Pressure"],
  ]));
  const prep = await prepareImport(fd);
  if (!prep.ok) throw new Error("prepare failed");

  const r = await commitImport({ importId: prep.result.importId, duplicates: "skip" });
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.counts).toMatchObject({ added: 1, updated: 0, skipped: 1, errored: 0 });
  expect(r.vendorsCreated).toBe(1);
  expect(r.categoriesCreated).toBe(1);
  expect(r.subcategoriesCreated).toBe(1);

  const [old] = await db.select().from(items).where(eq(items.sku, "OLD-1"));
  expect(old.description).toBe("old desc");

  const [audit] = await db.select().from(auditLog);
  expect(audit.kind).toBe("catalog.imported");
  expect(audit.summary).toContain("1");
});

test("commitImport (update duplicates): overwrites existing item", async () => {
  const { org } = await setupOrgWithUser();

  await db.insert(items).values({
    organizationId: org.id,
    sku: "OLD-1", description: "old desc", manufacturer: "old mfr",
    unit: "pcs",
    vendorId: null, categoryId: null, subcategoryId: null,
  });

  const fd = new FormData();
  fd.set("file", await makeFile([
    ["OLD-1", "NEW DESC", "NEW MFR", "pcs", "", "", ""],
  ]));
  const prep = await prepareImport(fd);
  if (!prep.ok) throw new Error("prepare failed");

  const r = await commitImport({ importId: prep.result.importId, duplicates: "update" });
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.counts).toMatchObject({ added: 0, updated: 1, skipped: 0 });

  const [old] = await db.select().from(items).where(eq(items.sku, "OLD-1"));
  expect(old.description).toBe("NEW DESC");
});

test("commitImport returns expired when staging file is gone", async () => {
  await setupOrgWithUser();
  const r = await commitImport({ importId: "missing", duplicates: "skip" });
  expect(r.ok).toBe(false);
  if (r.ok) return;
  expect(r.error).toBe("expired");
});

test("commitImport produces errors.xlsx when there are error rows", async () => {
  await setupOrgWithUser();

  const fd = new FormData();
  fd.set("file", await makeFile([
    ["GOOD-1", "d", "m", "pcs", "", "", ""],
    ["",       "d", "m", "pcs", "", "", ""],
  ]));
  const prep = await prepareImport(fd);
  if (!prep.ok) throw new Error("prepare failed");

  const r = await commitImport({ importId: prep.result.importId, duplicates: "skip" });
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.counts.errored).toBe(1);
  expect(r.errorsFileUrl).toBeTruthy();
});
