import { beforeEach, expect, test, vi } from "vitest";
import ExcelJS from "exceljs";
import { resetDb, ensureOrg } from "@/../tests/test-helpers/db";
import { db } from "@/db/client";
import { vendors, categories, subcategories } from "@/db/schema";
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
import { prepareImport } from "@/server/actions/import";

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
    ["RES-1", "10k",  "Yageo",  "pcs", 0.012, 100, "in-stock", "MSR",   "Passive", "Resistors"],
    ["NEW-1", "100u", "TDK",    "pcs", 0.5,   10,  "in-stock", "NEWCO", "Sensors", "Pressure"],
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
