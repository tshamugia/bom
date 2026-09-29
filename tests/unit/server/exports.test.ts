import { beforeEach, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";
import { resetDb } from "@/../tests/test-helpers/db";
import { mockSession } from "@/../tests/test-helpers/auth";
import { db } from "@/db/client";
import ExcelJS from "exceljs";
import { items, vendors, categories, projects, boms, bomRevisions, bomLines, bomExports } from "@/db/schema";
import { generateExport } from "@/server/actions/exports";
import { listExports } from "@/server/queries/exports";
import { renderExportFile } from "@/server/lib/run-export";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/auth-context", () => ({ requireSession: vi.fn(), requireRole: vi.fn() }));

beforeEach(async () => {
  await resetDb();
});

async function setup() {
  const { user: u } = await mockSession();

  const [v] = await db.insert(vendors).values({ name: "M", code: "M", country: "US", leadTime: "3d", rating: 4, status: "approved" }).returning();
  const [c] = await db.insert(categories).values({ name: "C" }).returning();
  const [it] = await db.insert(items).values({ sku: "X-1", description: "x", manufacturer: "Y", unit: "pcs", vendorId: v.id, categoryId: c.id, subcategoryId: null }).returning();

  const [p] = await db.insert(projects).values({ code: "TST", name: "Test" }).returning();
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

async function readSheet(buf: Buffer, name = "BOM") {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return wb.getWorksheet(name)!;
}

async function exportRow(id: string) {
  const [row] = await db.select().from(bomExports).where(eq(bomExports.id, id));
  return row;
}

test("generateExport returns the workbook and records a row without storing the file", async () => {
  const { revisionId, userId } = await setup();
  const ex = await generateExport({
    revisionId,
    options: defaultOptions(),
  });
  if (!ex.ok) throw new Error(ex.error);
  expect(ex.fileName).toMatch(/^BOM_TST_Rev_A\.xlsx$/);
  const ws = await readSheet(Buffer.from(ex.data, "base64"));
  expect(ws.getRow(6).getCell(2).value).toBe("X-1");

  const list = await listExports();
  expect(list).toHaveLength(1);
  expect(list[0].id).toBe(ex.id);
  expect(list[0].generatedById).toBe(userId);
  expect((await exportRow(ex.id)).fileKey).toBeNull();
});

test("generateExport returns an error instead of throwing when the revision is missing", async () => {
  await mockSession();
  const ex = await generateExport({ revisionId: "nope", options: defaultOptions() });
  expect(ex).toEqual({ ok: false, error: "This revision no longer exists." });
});

test("generateExport rejects viewers", async () => {
  const { revisionId } = await setup();
  await mockSession("viewer");
  const ex = await generateExport({ revisionId, options: defaultOptions() });
  expect(ex.ok).toBe(false);
  expect(await listExports()).toHaveLength(0);
});

test("renderExportFile rebuilds a recorded export with its options", async () => {
  const { revisionId } = await setup();
  const ex = await generateExport({
    revisionId,
    options: { ...defaultOptions(), includeCoverPage: true },
  });
  if (!ex.ok) throw new Error(ex.error);

  const file = await renderExportFile(ex.id);
  expect(file?.fileName).toBe(ex.fileName);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(file!.buffer as unknown as ArrayBuffer);
  expect(wb.worksheets.map(w => w.name)).toEqual(["Cover", "BOM"]);
  expect(wb.getWorksheet("BOM")!.getRow(6).getCell(2).value).toBe("X-1");

  expect(await renderExportFile("missing")).toBeNull();
});

test("generateExport on draft revision records revisionStatusAtExport=draft", async () => {
  const { revisionId } = await setup();
  await db.update(bomRevisions).set({ status: "draft" }).where(eq(bomRevisions.id, revisionId));
  const ex = await generateExport({ revisionId, options: defaultOptions() });
  if (!ex.ok) throw new Error(ex.error);
  expect((await exportRow(ex.id)).revisionStatusAtExport).toBe("draft");
  expect(ex.fileName).toMatch(/^BOM_TST_Rev_A_DRAFT_\d{4}-\d{2}-\d{2}\.xlsx$/);
});

test("generateExport on committed revision records revisionStatusAtExport=committed", async () => {
  const { revisionId } = await setup();
  await db.update(bomRevisions).set({ status: "committed" }).where(eq(bomRevisions.id, revisionId));
  const ex = await generateExport({ revisionId, options: defaultOptions() });
  if (!ex.ok) throw new Error(ex.error);
  expect((await exportRow(ex.id)).revisionStatusAtExport).toBe("committed");
});
