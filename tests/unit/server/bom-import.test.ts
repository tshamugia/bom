import { beforeEach, expect, test, vi } from "vitest";
import ExcelJS from "exceljs";
import { asc, eq } from "drizzle-orm";
import { resetDb } from "@/../tests/test-helpers/db";
import { mockSession } from "@/../tests/test-helpers/auth";
import { db } from "@/db/client";
import {
  auditLog, bomLines, bomRevisions, bomSections, boms, categories, items, projects, subcategories, vendors,
} from "@/db/schema";
import { BOM_IMPORT_COLUMNS } from "@/lib/schemas/bom-import";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/auth-context", () => ({ requireSession: vi.fn(), requireRole: vi.fn() }));

import { commitBomImport, previewBomImport } from "@/server/actions/bom-import";

beforeEach(async () => { await resetDb(); });

async function file(rows: (string | number)[][], name = "Fire alarm.xlsx"): Promise<File> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("BOM");
  ws.addRow([...BOM_IMPORT_COLUMNS]);
  for (const r of rows) ws.addRow(r);
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  return new File([buf], name, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function form(f: File, fields: Record<string, string> = {}): FormData {
  const fd = new FormData();
  fd.set("file", f);
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

async function seed() {
  const [v] = await db.insert(vendors).values({ name: "Mouser", code: "MSR", country: "US", leadTime: "3d", rating: 4, status: "approved" }).returning();
  const [cat] = await db.insert(categories).values({ name: "Fire" }).returning();
  const [it] = await db.insert(items).values({ sku: "CAT-1", description: "Catalog detector", manufacturer: "Bosch", unit: "pcs", vendorId: v.id, categoryId: cat.id, subcategoryId: null }).returning();
  const [p] = await db.insert(projects).values({ code: "P1", name: "Project" }).returning();
  return { vendor: v, item: it, project: p };
}

const ROWS: (string | number)[][] = [
  ["Fire alarm", "CAT-1", 4, "ignored for catalog items", "x"],
  ["Fire alarm", "NEW-1", 2, "New sounder", "Apollo", "", "NEWV", "Fire", "Sounders"],
  ["IT network", "NEW-2", 10, "Cat6 cable", "Legrand", "box", "", "Cabling", ""],
  ["", "NEW-3", 1, "Spare key", "Bosch"],
];

test("preview describes the import and saves nothing", async () => {
  await mockSession("member");
  await seed();
  const r = await previewBomImport(form(await file(ROWS)));
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.summary).toMatchObject({
    lines: 4,
    totalQty: 17,
    existingItems: 1,
    unsectionedLines: 1,
    newVendors: ["NEWV"],
    newCategories: ["Cabling"],
    newSubcategories: [{ category: "Fire", subcategory: "Sounders" }],
    errors: [],
  });
  expect(r.summary.newItems.map(i => i.sku)).toEqual(["NEW-1", "NEW-2", "NEW-3"]);
  expect("rows" in r.summary).toBe(false);
  expect(await db.select().from(boms)).toHaveLength(0);
  expect(await db.select().from(items)).toHaveLength(1);
});

test("new BOM from file: creates the BOM, Rev A draft, sections, lines and the missing SKUs", async () => {
  const { user } = await mockSession("member");
  const { project, item } = await seed();

  const r = await commitBomImport(form(await file(ROWS), { mode: "new", projectId: project.id, name: "Fire alarm" }));
  expect(r).toMatchObject({ ok: true, projectId: project.id, lines: 4, itemsCreated: 3 });
  if (!r.ok) return;

  const [bom] = await db.select().from(boms).where(eq(boms.id, r.bomId));
  expect(bom).toMatchObject({ name: "Fire alarm", ownerId: user.id, projectId: project.id });
  const [rev] = await db.select().from(bomRevisions).where(eq(bomRevisions.id, r.revisionId));
  expect(rev).toMatchObject({ letter: "A", status: "draft", ownerId: user.id });

  const sections = await db.select().from(bomSections).where(eq(bomSections.revisionId, r.revisionId)).orderBy(asc(bomSections.position));
  expect(sections.map(s => [s.name, s.position])).toEqual([["Fire alarm", 0], ["IT network", 1]]);
  const sectionName = new Map(sections.map(s => [s.id, s.name]));

  const lines = await db.select().from(bomLines).where(eq(bomLines.revisionId, r.revisionId));
  const bySku = new Map(lines.map(l => [l.skuSnapshot, l]));
  expect(lines).toHaveLength(4);
  // Catalog items keep their own data; the file's description is ignored.
  expect(bySku.get("CAT-1")).toMatchObject({ itemId: item.id, qty: 4, descriptionSnapshot: "Catalog detector", vendorNameSnapshot: "Mouser", position: 0 });
  expect(sectionName.get(bySku.get("CAT-1")!.sectionId!)).toBe("Fire alarm");
  expect(bySku.get("NEW-1")).toMatchObject({ qty: 2, descriptionSnapshot: "New sounder", manufacturerSnapshot: "Apollo", vendorNameSnapshot: "NEWV", position: 1 });
  expect(bySku.get("NEW-2")).toMatchObject({ qty: 10, unitSnapshot: "box", position: 0 });
  expect(bySku.get("NEW-3")).toMatchObject({ sectionId: null, unitSnapshot: "pcs" });

  const [newItem] = await db.select().from(items).where(eq(items.sku, "NEW-1"));
  const [newVendor] = await db.select().from(vendors).where(eq(vendors.code, "NEWV"));
  const [sub] = await db.select().from(subcategories).where(eq(subcategories.name, "Sounders"));
  expect(newItem).toMatchObject({ description: "New sounder", manufacturer: "Apollo", vendorId: newVendor.id, subcategoryId: sub.id });
  expect(await db.select().from(categories).where(eq(categories.name, "Cabling"))).toHaveLength(1);

  const kinds = (await db.select({ kind: auditLog.kind }).from(auditLog)).map(a => a.kind).sort();
  expect(kinds).toEqual(["bom.created", "bom.imported"]);
});

test("any row error refuses the whole file", async () => {
  await mockSession();
  const { project } = await seed();
  const r = await commitBomImport(form(await file([
    ["", "CAT-1", 1],
    ["", "NEW-1", 1, "", ""],
  ]), { mode: "new", projectId: project.id, name: "X" }));
  expect(r).toMatchObject({ ok: false, error: "has_errors" });
  if (r.ok) return;
  expect(r.summary?.errors.map(e => e.reason)).toEqual(["new_sku_missing_description", "new_sku_missing_manufacturer"]);
  expect(await db.select().from(boms)).toHaveLength(0);
  expect(await db.select().from(items)).toHaveLength(1);
});

test("a BOM name already used in the project (archived too) is refused", async () => {
  await mockSession();
  const { project } = await seed();
  await db.insert(boms).values({ projectId: project.id, name: "Fire alarm", deletedAt: new Date() });
  const r = await commitBomImport(form(await file([["", "CAT-1", 1]]), { mode: "new", projectId: project.id, name: "Fire alarm" }));
  expect(r).toMatchObject({ ok: false, error: "name_taken" });
});

test("import into a draft: reuses sections by name, adds to SKUs already there, appends the rest", async () => {
  await mockSession();
  const { project, item } = await seed();
  const [bom] = await db.insert(boms).values({ projectId: project.id, name: "Main" }).returning();
  const [rev] = await db.insert(bomRevisions).values({ bomId: bom.id, letter: "A", status: "draft" }).returning();
  const [fire] = await db.insert(bomSections).values({ revisionId: rev.id, name: "Fire Alarm", position: 0 }).returning();
  await db.insert(bomLines).values({ revisionId: rev.id, sectionId: fire.id, itemId: item.id, qty: 3, skuSnapshot: "CAT-1", position: 0 });

  const fd = await file([
    ["IT network", "CAT-1", 2],
    ["fire alarm", "NEW-1", 1, "Sounder", "Apollo"],
    ["IT network", "NEW-2", 5, "Cable", "Legrand"],
  ]);
  const preview = await previewBomImport(form(fd, { revisionId: rev.id }));
  expect(preview).toMatchObject({ ok: true, summary: { mergedLines: 1 } });
  if (!preview.ok) return;
  expect(preview.summary.sections.map(s => [s.name, s.isNew])).toEqual([["IT network", true], ["fire alarm", false]]);

  const r = await commitBomImport(form(fd, { mode: "revision", revisionId: rev.id }));
  expect(r).toMatchObject({ ok: true, bomId: bom.id, revisionId: rev.id, itemsCreated: 2 });

  const sections = await db.select().from(bomSections).where(eq(bomSections.revisionId, rev.id)).orderBy(asc(bomSections.position));
  expect(sections.map(s => s.name)).toEqual(["Fire Alarm", "IT network"]);
  const lines = await db.select().from(bomLines).where(eq(bomLines.revisionId, rev.id));
  const bySku = new Map(lines.map(l => [l.skuSnapshot, l]));
  expect(lines).toHaveLength(3);
  // Already on the draft: quantity goes up, the line stays in its section.
  expect(bySku.get("CAT-1")).toMatchObject({ qty: 5, sectionId: fire.id, position: 0 });
  expect(bySku.get("NEW-1")).toMatchObject({ sectionId: fire.id, position: 1 });
  expect(bySku.get("NEW-2")).toMatchObject({ sectionId: sections[1].id, position: 0 });
});

test("a committed revision can't be imported into", async () => {
  await mockSession();
  const { project } = await seed();
  const [bom] = await db.insert(boms).values({ projectId: project.id, name: "Main" }).returning();
  const [rev] = await db.insert(bomRevisions).values({ bomId: bom.id, letter: "A", status: "committed" }).returning();
  const f = await file([["", "CAT-1", 1]]);
  expect(await previewBomImport(form(f, { revisionId: rev.id }))).toMatchObject({ ok: false, error: "revision_locked" });
  expect(await commitBomImport(form(f, { mode: "revision", revisionId: rev.id }))).toMatchObject({ ok: false, error: "revision_locked" });
  expect(await db.select().from(bomLines)).toHaveLength(0);
});

test("viewers can't import", async () => {
  await mockSession("viewer");
  const { project } = await seed();
  const f = await file([["", "CAT-1", 1]]);
  await expect(previewBomImport(form(f))).rejects.toThrow("FORBIDDEN");
  await expect(commitBomImport(form(f, { mode: "new", projectId: project.id, name: "X" }))).rejects.toThrow("FORBIDDEN");
});

test("header mismatch and oversize files are reported", async () => {
  await mockSession();
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet("BOM").addRow(["sku", "qty"]);
  const bad = new File([Buffer.from(await wb.xlsx.writeBuffer())], "old.xlsx");
  expect(await previewBomImport(form(bad))).toMatchObject({ ok: false, error: "header_mismatch", expected: [...BOM_IMPORT_COLUMNS] });

  const big = new File([Buffer.alloc(11 * 1024 * 1024)], "big.xlsx");
  expect(await previewBomImport(form(big))).toMatchObject({ ok: false, error: "too_large" });
});
