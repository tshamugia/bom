# BOM Studio — Plan 04: Preview & Generate (Excel Export + S3 + History)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Prerequisites:** Plans 01–03 complete and committed.

**Goal:** Add real .xlsx export. Build the `/preview/[projectId]` page (document preview, export options, summary card), the "Generate Excel" confirmation modal, the actual exceljs builder, S3 upload, presigned download, the persisted `bom_exports` table, the `/history` page, and the re-download endpoint.

**Architecture:**
- A **bom_export** is the artifact of a "generate" click: it captures the revision id, the export format (xlsx/csv/pdf — only xlsx in this plan), the option flags (vendor pricing / stock / group-by-vendor / cover page), the file's S3 key + size, and who generated it.
- The xlsx file is built in-memory with **exceljs**, uploaded to S3 via the helper from Plan 01, and the row is inserted. We never store the raw bytes in Postgres.
- Downloads are served by a route handler that authenticates the user, scopes the export to their org, generates a presigned S3 URL, and 302-redirects to it. Direct S3 URLs are never exposed in the page HTML.
- The Preview page is RSC; the Generate dialog is a client component that calls a Server Action and toasts on success.

**Tech Stack additions:** `exceljs` (install).

---

## File structure

Created in this plan:

```
src/db/schema/
  bom-exports.ts
  index.ts                     # extended re-exports
src/lib/
  excel.ts                     # exceljs builder
src/server/
  queries/
    exports.ts                 # listExports, getExport
  actions/
    exports.ts                 # generateExport
src/components/preview/
  document-preview.tsx
  summary-card.tsx
  export-options-card.tsx
  approvers-card.tsx
  generate-dialog.tsx
src/components/history/
  history-table.tsx
src/app/(app)/
  preview/page.tsx              # rewritten — project picker
  preview/[projectId]/page.tsx
  history/page.tsx              # rewritten
src/app/api/
  exports/[id]/download/route.ts
tests/unit/lib/
  excel.test.ts
tests/unit/server/
  exports.test.ts
tests/e2e/
  preview.spec.ts
```

---

## Tasks

### Task 1: BOM exports schema

**Files:**
- Create: `src/db/schema/bom-exports.ts`

- [ ] **Step 1: Write the schema**

```ts
import { pgTable, text, timestamp, integer, pgEnum, jsonb } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { bomRevisions } from "./bom-revisions";
import { user } from "./auth";

export const exportFormatEnum = pgEnum("export_format", ["xlsx", "csv", "pdf"]);
export const exportStatusEnum = pgEnum("export_status", ["exported", "archived", "failed"]);

export type ExportOptions = {
  includeVendorPricing: boolean;
  includeStockAvailability: boolean;
  groupByVendor: boolean;
  includeCoverPage: boolean;
};

export const bomExports = pgTable("bom_export", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  revisionId: text("revision_id").notNull().references(() => bomRevisions.id, { onDelete: "cascade" }),
  format: exportFormatEnum("format").notNull().default("xlsx"),
  fileKey: text("file_key").notNull(),
  fileName: text("file_name").notNull(),
  byteSize: integer("byte_size").notNull(),
  options: jsonb("options").notNull().$type<ExportOptions>(),
  status: exportStatusEnum("status").notNull().default("exported"),
  generatedById: text("generated_by_id").references(() => user.id, { onDelete: "set null" }),
  generatedAt: timestamp("generated_at").notNull().defaultNow(),
});
```

- [ ] **Step 2: Re-export and migrate**

Append to `src/db/schema/index.ts`:

```ts
export * from "./bom-exports";
```

```bash
npm run db:generate
npm run db:migrate
```

Expected: `0003_*.sql` is created and applied.

- [ ] **Step 3: Commit**

```bash
git add src/db
git commit -m "feat(db): bom_exports table"
```

---

### Task 2: exceljs library wrapper (with failing test first)

**Files:**
- Create: `src/lib/excel.ts`
- Create: `tests/unit/lib/excel.test.ts`

- [ ] **Step 1: Install exceljs**

```bash
npm install exceljs
```

- [ ] **Step 2: Write the failing test**

`tests/unit/lib/excel.test.ts`:

```ts
import { expect, test } from "vitest";
import ExcelJS from "exceljs";
import { buildBomWorkbook, type BomRow } from "@/lib/excel";

const ROWS: BomRow[] = [
  { sku: "RES-1", description: "10k", manufacturer: "Yageo", vendor: "Mouser", unit: "pcs", qty: 10, unitPrice: 0.012 },
  { sku: "CAP-1", description: "100nF", manufacturer: "Murata", vendor: "DigiSource", unit: "pcs", qty: 18, unitPrice: 0.018 },
];

test("buildBomWorkbook produces a workbook with header, rows, and totals", async () => {
  const buf = await buildBomWorkbook({
    project: { code: "TEST-1", name: "Test Project", quantity: 50, owner: "M. Chen", target: "May 14, 2026" },
    revisionLetter: "A",
    rows: ROWS,
    options: { includeVendorPricing: true, includeStockAvailability: false, groupByVendor: false, includeCoverPage: false },
  });

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const sheet = wb.getWorksheet("BOM");
  expect(sheet).toBeDefined();
  expect(sheet!.getCell("A1").value).toBe("Bill of Materials");
  // Headers on row 5 (after meta block).
  expect(sheet!.getCell("A5").value).toBe("#");
  expect(sheet!.getCell("B5").value).toBe("SKU");
  // Data starts row 6.
  expect(sheet!.getCell("B6").value).toBe("RES-1");
  // Total formula in last data row's "Total" column.
  const totalCell = sheet!.getRow(7).getCell(8); // 2 rows × header row 5 → row 7 col H
  expect(typeof totalCell.value).toBe("object"); // formula object
});

test("groupByVendor=true creates per-vendor sheets", async () => {
  const buf = await buildBomWorkbook({
    project: { code: "T", name: "T", quantity: 1, owner: "X", target: "—" },
    revisionLetter: "A",
    rows: ROWS,
    options: { includeVendorPricing: true, includeStockAvailability: false, groupByVendor: true, includeCoverPage: false },
  });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  expect(wb.getWorksheet("Mouser")).toBeDefined();
  expect(wb.getWorksheet("DigiSource")).toBeDefined();
});
```

- [ ] **Step 3: Run — expect failure**

```bash
npm test -- excel
```

Expected: module-not-found for `@/lib/excel`.

- [ ] **Step 4: Implement `src/lib/excel.ts`**

```ts
import ExcelJS from "exceljs";

export type BomRow = {
  sku: string;
  description: string;
  manufacturer: string;
  vendor: string | null;
  unit: string;
  qty: number;
  unitPrice: number;
  stock?: string;
};

export type BuildOptions = {
  includeVendorPricing: boolean;
  includeStockAvailability: boolean;
  groupByVendor: boolean;
  includeCoverPage: boolean;
};

export type BuildInput = {
  project: { code: string; name: string; quantity: number; owner: string; target: string };
  revisionLetter: string;
  rows: BomRow[];
  options: BuildOptions;
};

export async function buildBomWorkbook(input: BuildInput): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "BOM Studio";
  wb.created = new Date();

  if (input.options.includeCoverPage) buildCoverSheet(wb, input);
  buildMainSheet(wb, input);

  if (input.options.groupByVendor) {
    const byVendor = new Map<string, BomRow[]>();
    for (const r of input.rows) {
      const key = r.vendor ?? "Unassigned";
      if (!byVendor.has(key)) byVendor.set(key, []);
      byVendor.get(key)!.push(r);
    }
    for (const [vendor, rows] of byVendor) {
      buildMainSheet(wb, { ...input, rows }, sanitizeSheetName(vendor));
    }
  }

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

function sanitizeSheetName(name: string) {
  return name.replace(/[\\\/\?\*\[\]:]/g, "_").slice(0, 31);
}

function buildCoverSheet(wb: ExcelJS.Workbook, input: BuildInput) {
  const ws = wb.addWorksheet("Cover");
  ws.getCell("A1").value = "Bill of Materials";
  ws.getCell("A1").font = { bold: true, size: 22 };
  ws.getCell("A3").value = `${input.project.code} — ${input.project.name}`;
  ws.getCell("A4").value = `Revision ${input.revisionLetter} · Build qty ${input.project.quantity}`;
  ws.getCell("A5").value = `Owner: ${input.project.owner}`;
  ws.getCell("A6").value = `Target: ${input.project.target}`;
  ws.getCell("A8").value = "Halcyon Robotics";
  ws.getCell("A8").font = { bold: true };
  ws.getCell("A9").value = "438 Industrial Way · Oakland, CA";
  ws.getColumn(1).width = 60;
}

function buildMainSheet(wb: ExcelJS.Workbook, input: BuildInput, name = "BOM") {
  const ws = wb.addWorksheet(name);

  // Title block
  ws.mergeCells("A1:H1");
  ws.getCell("A1").value = "Bill of Materials";
  ws.getCell("A1").font = { bold: true, size: 16 };

  ws.mergeCells("A2:H2");
  ws.getCell("A2").value = `${input.project.code} — ${input.project.name}  ·  Rev. ${input.revisionLetter}`;
  ws.getCell("A2").font = { color: { argb: "FF6B7180" }, size: 11 };

  ws.mergeCells("A3:H3");
  ws.getCell("A3").value = `Owner: ${input.project.owner}   Target: ${input.project.target}   Build qty: ${input.project.quantity}`;
  ws.getCell("A3").font = { color: { argb: "FF6B7180" }, size: 10 };

  // Header row
  const headers = ["#", "SKU", "Description", "Manufacturer", "Vendor", "Unit", "Qty"];
  if (input.options.includeVendorPricing) headers.push("Unit price", "Total");
  if (input.options.includeStockAvailability) headers.push("Stock");

  const headerRow = ws.getRow(5);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: "FF6B7180" }, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFECEEF2" } };
    cell.alignment = { vertical: "middle" };
    cell.border = { bottom: { style: "thin", color: { argb: "FFE4E6EB" } } };
  });

  // Data rows
  input.rows.forEach((r, idx) => {
    const row = ws.getRow(6 + idx);
    let col = 1;
    row.getCell(col++).value = idx + 1;
    row.getCell(col++).value = r.sku;
    row.getCell(col++).value = r.description;
    row.getCell(col++).value = r.manufacturer;
    row.getCell(col++).value = r.vendor ?? "—";
    row.getCell(col++).value = r.unit;
    row.getCell(col++).value = r.qty;
    if (input.options.includeVendorPricing) {
      row.getCell(col++).value = r.unitPrice;
      row.getCell(col).value = { formula: `G${6 + idx}*H${6 + idx}` };
      col++;
    }
    if (input.options.includeStockAvailability) row.getCell(col++).value = r.stock ?? "";
  });

  if (input.options.includeVendorPricing && input.rows.length > 0) {
    const totalsRow = ws.getRow(6 + input.rows.length + 1);
    totalsRow.getCell(7).value = "Total";
    totalsRow.getCell(7).font = { bold: true };
    totalsRow.getCell(9).value = { formula: `SUM(I6:I${5 + input.rows.length})` };
    totalsRow.getCell(9).font = { bold: true };
  }

  // Column widths
  [4, 18, 38, 18, 22, 6, 8, 12, 12, 14].forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  ws.views = [{ state: "frozen", ySplit: 5 }];
}
```

- [ ] **Step 5: Re-run tests**

```bash
npm test -- excel
```

Expected: both tests pass.

- [ ] **Step 6: Commit**

```bash
git add package.json src/lib/excel.ts tests/unit/lib/excel.test.ts
git commit -m "feat(excel): exceljs workbook builder with options + tests"
```

---

### Task 3: Export server action (with failing test first)

**Files:**
- Create: `src/server/actions/exports.ts`
- Create: `src/server/queries/exports.ts`
- Create: `tests/unit/server/exports.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/server/exports.test.ts`:

```ts
import { beforeEach, expect, test, vi } from "vitest";
import { resetDb, ensureOrg } from "@/../tests/test-helpers/db";
import { db } from "@/db/client";
import { items, vendors, categories, projects, bomRevisions, bomLines, bomExports, user } from "@/db/schema";
import { generateExport } from "@/server/actions/exports";
import { listExports } from "@/server/queries/exports";

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
```

- [ ] **Step 2: Run — expect failure**

```bash
npm test -- exports
```

Expected: failure (modules don't exist).

- [ ] **Step 3: Implement queries**

`src/server/queries/exports.ts`:

```ts
import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { bomExports, bomRevisions, projects, user } from "@/db/schema";
import { getCurrentOrgId } from "../org";

export async function listExports() {
  const orgId = await getCurrentOrgId();
  return db
    .select({
      id: bomExports.id,
      fileName: bomExports.fileName,
      format: bomExports.format,
      byteSize: bomExports.byteSize,
      generatedAt: bomExports.generatedAt,
      generatedById: bomExports.generatedById,
      generatedByName: user.name,
      status: bomExports.status,
      revisionLetter: bomRevisions.letter,
      projectCode: projects.code,
      projectName: projects.name,
    })
    .from(bomExports)
    .innerJoin(bomRevisions, eq(bomRevisions.id, bomExports.revisionId))
    .innerJoin(projects, eq(projects.id, bomRevisions.projectId))
    .leftJoin(user, eq(user.id, bomExports.generatedById))
    .where(eq(projects.organizationId, orgId))
    .orderBy(desc(bomExports.generatedAt));
}

export async function getExport(id: string) {
  const orgId = await getCurrentOrgId();
  const [row] = await db
    .select({
      id: bomExports.id,
      fileKey: bomExports.fileKey,
      fileName: bomExports.fileName,
      format: bomExports.format,
    })
    .from(bomExports)
    .innerJoin(bomRevisions, eq(bomRevisions.id, bomExports.revisionId))
    .innerJoin(projects, eq(projects.id, bomRevisions.projectId))
    .where(and(eq(bomExports.id, id), eq(projects.organizationId, orgId)))
    .limit(1);
  return row ?? null;
}
```

- [ ] **Step 4: Implement actions**

`src/server/actions/exports.ts`:

```ts
"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { bomExports, bomLines, bomRevisions, items, projects, vendors, user } from "@/db/schema";
import { getCurrentOrgId, requireSession } from "../org";
import { buildBomWorkbook, type BomRow } from "@/lib/excel";
import { putObject } from "@/lib/s3";

const Options = z.object({
  includeVendorPricing: z.boolean(),
  includeStockAvailability: z.boolean(),
  groupByVendor: z.boolean(),
  includeCoverPage: z.boolean(),
});

export async function generateExport(input: { revisionId: string; options: z.infer<typeof Options> }) {
  const options = Options.parse(input.options);
  const orgId = await getCurrentOrgId();
  const session = await requireSession();

  const [rev] = await db
    .select({
      id: bomRevisions.id,
      letter: bomRevisions.letter,
      projectId: bomRevisions.projectId,
      projectCode: projects.code,
      projectName: projects.name,
      projectQty: projects.quantity,
      projectTarget: projects.targetDate,
      ownerName: user.name,
    })
    .from(bomRevisions)
    .innerJoin(projects, eq(projects.id, bomRevisions.projectId))
    .leftJoin(user, eq(user.id, projects.ownerId))
    .where(and(eq(bomRevisions.id, input.revisionId), eq(projects.organizationId, orgId)))
    .limit(1);
  if (!rev) throw new Error("REVISION_NOT_FOUND");

  const lines = await db
    .select({
      sku: items.sku, description: items.description, manufacturer: items.manufacturer,
      unit: items.unit, qty: bomLines.qty, unitPriceSnapshot: bomLines.unitPriceSnapshot,
      vendorName: vendors.name, stockState: items.stockState, position: bomLines.position,
    })
    .from(bomLines)
    .innerJoin(items, eq(items.id, bomLines.itemId))
    .leftJoin(vendors, eq(vendors.id, items.vendorId))
    .where(eq(bomLines.revisionId, rev.id))
    .orderBy(bomLines.position);

  const rows: BomRow[] = lines.map(l => ({
    sku: l.sku, description: l.description, manufacturer: l.manufacturer,
    vendor: l.vendorName, unit: l.unit, qty: l.qty, unitPrice: Number(l.unitPriceSnapshot),
    stock: l.stockState,
  }));

  const buf = await buildBomWorkbook({
    project: {
      code: rev.projectCode,
      name: rev.projectName,
      quantity: rev.projectQty,
      owner: rev.ownerName ?? session.user.name,
      target: rev.projectTarget ?? "—",
    },
    revisionLetter: rev.letter,
    rows,
    options,
  });

  const fileName = `BOM_${rev.projectCode}_Rev_${rev.letter}.xlsx`;
  const fileKey = `${orgId}/exports/${rev.id}/${Date.now()}-${fileName}`;
  await putObject(fileKey, buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");

  const [row] = await db.insert(bomExports).values({
    revisionId: rev.id,
    format: "xlsx",
    fileKey,
    fileName,
    byteSize: buf.length,
    options,
    status: "exported",
    generatedById: session.user.id,
  }).returning();

  revalidatePath("/history");
  revalidatePath(`/preview/${rev.projectId}`);
  return row;
}
```

- [ ] **Step 5: Run tests**

```bash
npm test -- exports
```

Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add src/server/queries/exports.ts src/server/actions/exports.ts tests/unit/server/exports.test.ts
git commit -m "feat(exports): generateExport server action + listExports query"
```

---

### Task 4: Download route handler

**Files:**
- Create: `src/app/api/exports/[id]/download/route.ts`

- [ ] **Step 1: Write the route**

```ts
import { NextResponse, type NextRequest } from "next/server";
import { presignDownload } from "@/lib/s3";
import { getExport } from "@/server/queries/exports";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const ex = await getExport(id);
  if (!ex) return new NextResponse("Not found", { status: 404 });
  const url = await presignDownload(ex.fileKey, 60 * 5);
  return NextResponse.redirect(url);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/exports
git commit -m "feat(exports): presigned download route"
```

---

### Task 5: Document preview component

**Files:**
- Create: `src/components/preview/document-preview.tsx`

- [ ] **Step 1: Write the component**

```tsx
import type { Line } from "@/components/builder/bom-line-table";

export function DocumentPreview({
  project, revisionLetter, lines, generatedOn,
}: {
  project: { code: string; name: string; owner: string; target: string; quantity: number };
  revisionLetter: string;
  lines: Line[];
  generatedOn: string;
}) {
  const subtotal = lines.reduce((s, l) => s + l.qty * Number(l.unitPriceSnapshot), 0);
  const tax = subtotal * 0.08;
  const grand = subtotal + tax;

  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-11 py-9 shadow-[var(--shadow-elev)]">
      <div className="mb-5 flex items-start justify-between border-b-2 border-[var(--color-text)] pb-4">
        <div>
          <h2 className="m-0 text-[24px] font-bold tracking-tight">Bill of Materials</h2>
          <div className="mt-1 text-[12px] text-[var(--color-text-3)]">
            {project.code} — {project.name} · Rev. {revisionLetter} · {generatedOn}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[13px] font-semibold">Halcyon Robotics</div>
          <div className="text-[12px] text-[var(--color-text-3)]">438 Industrial Way · Oakland, CA</div>
          <div className="text-[12px] text-[var(--color-text-3)]">procurement@halcyon-robotics.com</div>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-3 gap-6 text-[11.5px]">
        <Meta label="Project owner" value={project.owner} />
        <Meta label="Target build" value={project.target} />
        <Meta label="Quantity" value={`${project.quantity} units`} />
      </div>

      <table className="w-full border-collapse text-[11.5px]">
        <thead>
          <tr className="bg-[var(--color-surface-3)] text-[10.5px] uppercase tracking-wider">
            <th className="border-b border-[var(--color-line)] px-2 py-1.5 text-left font-semibold">#</th>
            <th className="border-b border-[var(--color-line)] px-2 py-1.5 text-left font-semibold">SKU</th>
            <th className="border-b border-[var(--color-line)] px-2 py-1.5 text-left font-semibold">Description</th>
            <th className="border-b border-[var(--color-line)] px-2 py-1.5 text-left font-semibold">Vendor</th>
            <th className="border-b border-[var(--color-line)] px-2 py-1.5 text-left font-semibold">Unit</th>
            <th className="border-b border-[var(--color-line)] px-2 py-1.5 text-right font-semibold">Qty</th>
            <th className="border-b border-[var(--color-line)] px-2 py-1.5 text-right font-semibold">Unit price</th>
            <th className="border-b border-[var(--color-line)] px-2 py-1.5 text-right font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={l.id}>
              <td className="border-b border-[var(--color-line)] px-2 py-1.5 text-[var(--color-text-3)]">{i + 1}</td>
              <td className="border-b border-[var(--color-line)] px-2 py-1.5 font-mono">{l.sku}</td>
              <td className="border-b border-[var(--color-line)] px-2 py-1.5">{l.description}<div className="text-[10px] text-[var(--color-text-3)]">{l.manufacturer}</div></td>
              <td className="border-b border-[var(--color-line)] px-2 py-1.5">{l.vendorName ?? "—"}</td>
              <td className="border-b border-[var(--color-line)] px-2 py-1.5">{l.unit}</td>
              <td className="border-b border-[var(--color-line)] px-2 py-1.5 text-right tabular-nums">{l.qty}</td>
              <td className="border-b border-[var(--color-line)] px-2 py-1.5 text-right tabular-nums">${Number(l.unitPriceSnapshot).toFixed(3)}</td>
              <td className="border-b border-[var(--color-line)] px-2 py-1.5 text-right font-medium tabular-nums">${(l.qty * Number(l.unitPriceSnapshot)).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="ml-auto mt-5 w-72 text-[12px]">
        <div className="flex justify-between py-1"><span>Subtotal</span><span className="tabular-nums">${subtotal.toFixed(2)}</span></div>
        <div className="flex justify-between py-1"><span>Estimated tax (8%)</span><span className="tabular-nums">${tax.toFixed(2)}</span></div>
        <div className="mt-1.5 flex justify-between border-t-2 border-[var(--color-text)] pt-2 text-[14px] font-bold">
          <span>Grand total</span><span className="tabular-nums">${grand.toFixed(2)}</span>
        </div>
      </div>

      <div className="mt-8 flex justify-between border-t border-[var(--color-line-soft)] pt-3.5 text-[10.5px] text-[var(--color-text-3)]">
        <span>Generated by BOM Studio · Halcyon Robotics</span>
        <span>Page 1 of 1</span>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-0.5 text-[10px] uppercase tracking-wider text-[var(--color-text-3)]">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/preview/document-preview.tsx
git commit -m "feat(preview): document preview component"
```

---

### Task 6: Sidebar cards (Summary, Export Options, Approvers)

**Files:**
- Create: `src/components/preview/summary-card.tsx`
- Create: `src/components/preview/export-options-card.tsx`
- Create: `src/components/preview/approvers-card.tsx`

- [ ] **Step 1: Write SummaryCard**

`src/components/preview/summary-card.tsx`:

```tsx
export function SummaryCard({ lines, totalUnits, vendors, subtotal, tax, grand }: {
  lines: number; totalUnits: number; vendors: number; subtotal: number; tax: number; grand: number;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]">
      <div className="border-b border-[var(--color-line-soft)] px-4 py-3">
        <h3 className="text-[13.5px] font-semibold">Summary</h3>
      </div>
      <dl className="grid grid-cols-[130px_1fr] gap-y-2 gap-x-4 p-4 text-[12.5px]">
        <Term k="Lines" v={lines} />
        <Term k="Total units" v={totalUnits.toLocaleString()} />
        <Term k="Vendors" v={vendors} />
        <Term k="Subtotal" v={`$${subtotal.toFixed(2)}`} />
        <Term k="Tax" v={`$${tax.toFixed(2)}`} />
        <Term k="Grand total" v={`$${grand.toFixed(2)}`} bold />
      </dl>
    </div>
  );
}
function Term({ k, v, bold }: { k: string; v: string | number; bold?: boolean }) {
  return (
    <>
      <dt className={`text-[var(--color-text-3)] ${bold ? "font-semibold text-[var(--color-text)]" : ""}`}>{k}</dt>
      <dd className={`m-0 tabular-nums ${bold ? "font-semibold" : ""}`}>{v}</dd>
    </>
  );
}
```

- [ ] **Step 2: Write ExportOptionsCard**

`src/components/preview/export-options-card.tsx`:

```tsx
"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

export type ExportOpts = {
  includeVendorPricing: boolean;
  includeStockAvailability: boolean;
  groupByVendor: boolean;
  includeCoverPage: boolean;
  format: "xlsx" | "csv" | "pdf";
};

export function ExportOptionsCard({ opts, onChange }: { opts: ExportOpts; onChange: (next: ExportOpts) => void }) {
  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]">
      <div className="border-b border-[var(--color-line-soft)] px-4 py-3">
        <h3 className="text-[13.5px] font-semibold">Export options</h3>
      </div>
      <div className="flex flex-col gap-2.5 p-4 text-[12.5px]">
        <Row k="includeVendorPricing"     opts={opts} onChange={onChange}>Include vendor pricing</Row>
        <Row k="includeStockAvailability" opts={opts} onChange={onChange}>Include stock availability</Row>
        <Row k="groupByVendor"            opts={opts} onChange={onChange}>Group by vendor (separate sheets)</Row>
        <Row k="includeCoverPage"         opts={opts} onChange={onChange}>Include cover page</Row>
        <hr className="my-2 border-[var(--color-line-soft)]" />
        <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-3)]">Format</div>
        <Select value={opts.format} onValueChange={v => onChange({ ...opts, format: v as ExportOpts["format"] })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
            <SelectItem value="csv" disabled>CSV — coming soon</SelectItem>
            <SelectItem value="pdf" disabled>PDF — coming soon</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function Row({ k, opts, onChange, children }: { k: keyof Omit<ExportOpts, "format">; opts: ExportOpts; onChange: (n: ExportOpts) => void; children: React.ReactNode }) {
  return (
    <label className="flex items-center gap-2">
      <Checkbox checked={opts[k]} onCheckedChange={v => onChange({ ...opts, [k]: !!v })} />
      <span>{children}</span>
    </label>
  );
}
```

- [ ] **Step 3: Write ApproversCard (read-only stub; Plan 05 wires real data)**

`src/components/preview/approvers-card.tsx`:

```tsx
import { Badge } from "@/components/master/status-badge";

const STAGES = [
  { initials: "MC", name: "Marcus Chen",  role: "Engineering",  status: "done" },
  { initials: "SP", name: "Sarah Patel",  role: "Procurement",  status: "active" },
  { initials: "RH", name: "Ravi Hassan",  role: "Finance",      status: "pending" },
] as const;

export function ApproversCard() {
  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]">
      <div className="border-b border-[var(--color-line-soft)] px-4 py-3">
        <h3 className="text-[13.5px] font-semibold">Approvers</h3>
      </div>
      <div className="py-1">
        {STAGES.map(s => (
          <div key={s.name} className="flex items-center gap-2.5 px-4 py-2 text-[12.5px]">
            <div className="grid h-6 w-6 place-items-center rounded-full bg-[var(--color-accent)] text-[10px] font-semibold text-white">{s.initials}</div>
            <div className="flex-1">
              <div>{s.name}</div>
              <div className="text-[11px] text-[var(--color-text-3)]">{s.role}</div>
            </div>
            {s.status === "done"   && <Badge tone="success">Signed</Badge>}
            {s.status === "active" && <Badge tone="warning">Reviewing</Badge>}
            {s.status === "pending"&& <Badge tone="gray">Pending</Badge>}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/preview
git commit -m "feat(preview): summary, export options, approvers cards"
```

---

### Task 7: Generate confirmation dialog

**Files:**
- Create: `src/components/preview/generate-dialog.tsx`

- [ ] **Step 1: Write the dialog**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";
import { toast } from "sonner";
import { generateExport } from "@/server/actions/exports";
import type { ExportOpts } from "./export-options-card";

export function GenerateDialog({
  revisionId, projectCode, revisionLetter, lineCount, opts, trigger,
}: {
  revisionId: string;
  projectCode: string;
  revisionLetter: string;
  lineCount: number;
  opts: ExportOpts;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const fileName = `BOM_${projectCode}_Rev_${revisionLetter}.xlsx`;

  function go() {
    start(async () => {
      const ex = await generateExport({ revisionId, options: { includeVendorPricing: opts.includeVendorPricing, includeStockAvailability: opts.includeStockAvailability, groupByVendor: opts.groupByVendor, includeCoverPage: opts.includeCoverPage } });
      setOpen(false);
      toast.success(`BOM exported — ${ex.fileName}`);
      // Trigger download in a new tab.
      window.open(`/api/exports/${ex.id}/download`, "_blank");
      router.push("/history");
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
              <Icon.Sheet size={16} />
            </div>
            <div>
              <DialogTitle>Generate Excel file</DialogTitle>
              <p className="text-[12px] text-[var(--color-text-3)]">Confirm details before export</p>
            </div>
          </div>
        </DialogHeader>
        <dl className="grid grid-cols-[140px_1fr] gap-y-2 gap-x-4 p-1 text-[12.5px]">
          <dt className="text-[var(--color-text-3)]">File name</dt>
          <dd className="m-0 font-mono text-[12px]">{fileName}</dd>
          <dt className="text-[var(--color-text-3)]">Project</dt>
          <dd className="m-0">{projectCode}</dd>
          <dt className="text-[var(--color-text-3)]">Format</dt>
          <dd className="m-0">Excel Workbook (.xlsx)</dd>
          <dt className="text-[var(--color-text-3)]">Lines</dt>
          <dd className="m-0">{lineCount}</dd>
          <dt className="text-[var(--color-text-3)]">Will be archived to</dt>
          <dd className="m-0">History → {projectCode}</dd>
        </dl>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button onClick={go} disabled={pending}>
            <Icon.Download size={14} className="mr-1.5" />
            {pending ? "Generating…" : "Generate & download"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/preview/generate-dialog.tsx
git commit -m "feat(preview): generate confirmation dialog with toast + redirect"
```

---

### Task 8: Preview pages

**Files:**
- Replace: `src/app/(app)/preview/page.tsx` (project picker variant)
- Create: `src/app/(app)/preview/[projectId]/page.tsx`
- Create: `src/components/preview/preview-shell.tsx` (client wrapper for the options state)

- [ ] **Step 1: Write `preview-shell.tsx`**

`src/components/preview/preview-shell.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";
import { DocumentPreview } from "./document-preview";
import { SummaryCard } from "./summary-card";
import { ExportOptionsCard, type ExportOpts } from "./export-options-card";
import { ApproversCard } from "./approvers-card";
import { GenerateDialog } from "./generate-dialog";
import type { Line } from "@/components/builder/bom-line-table";

type Props = {
  projectId: string;
  projectCode: string;
  projectName: string;
  projectOwner: string;
  projectTarget: string;
  projectQuantity: number;
  revisionId: string;
  revisionLetter: string;
  lines: Line[];
};

export function PreviewShell(p: Props) {
  const router = useRouter();
  const [opts, setOpts] = useState<ExportOpts>({
    includeVendorPricing: true,
    includeStockAvailability: true,
    groupByVendor: false,
    includeCoverPage: false,
    format: "xlsx",
  });

  const subtotal = p.lines.reduce((s, l) => s + l.qty * Number(l.unitPriceSnapshot), 0);
  const tax = subtotal * 0.08;
  const grand = subtotal + tax;
  const totalUnits = p.lines.reduce((s, l) => s + l.qty, 0);
  const vendorCount = new Set(p.lines.map(l => l.vendorName).filter(Boolean)).size;

  return (
    <>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight">Preview &amp; Generate</h1>
          <p className="text-[13px] text-[var(--color-text-3)]">Review the generated document, then export to Excel for procurement.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.push(`/builder/${p.projectId}`)}>
            <Icon.ArrowLeft size={14} className="mr-1.5" /> Back to builder
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Icon.Print size={14} className="mr-1.5" /> Print
          </Button>
          <GenerateDialog
            revisionId={p.revisionId}
            projectCode={p.projectCode}
            revisionLetter={p.revisionLetter}
            lineCount={p.lines.length}
            opts={opts}
            trigger={<Button><Icon.Download size={14} className="mr-1.5" /> Generate Excel</Button>}
          />
        </div>
      </div>

      <div className="grid grid-cols-[1fr_280px] items-start gap-4">
        <DocumentPreview
          project={{
            code: p.projectCode, name: p.projectName, owner: p.projectOwner,
            target: p.projectTarget, quantity: p.projectQuantity,
          }}
          revisionLetter={p.revisionLetter}
          lines={p.lines}
          generatedOn={new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
        />
        <div className="sticky top-[68px] flex flex-col gap-3">
          <SummaryCard lines={p.lines.length} totalUnits={totalUnits} vendors={vendorCount} subtotal={subtotal} tax={tax} grand={grand} />
          <ExportOptionsCard opts={opts} onChange={setOpts} />
          <ApproversCard />
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Replace `/preview/page.tsx` with a project picker**

```tsx
import Link from "next/link";
import { listProjects } from "@/server/queries/projects";
import { PageHead } from "@/components/master/page-head";

export default async function PreviewIndex() {
  const list = await listProjects();
  return (
    <>
      <PageHead title="Preview & Generate" subtitle="Pick a project to preview and export." />
      <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-card)] divide-y divide-[var(--color-line-soft)]">
        {list.map(p => (
          <Link key={p.id} href={`/preview/${p.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-[var(--color-surface-2)]">
            <div>
              <div className="font-medium">{p.name}</div>
              <div className="font-mono text-[11px] text-[var(--color-text-3)]">{p.code}</div>
            </div>
            <div className="text-[12.5px] text-[var(--color-text-3)]">{p.lineCount} lines · ${p.total.toFixed(2)}</div>
          </Link>
        ))}
      </div>
    </>
  );
}
```

- [ ] **Step 3: Write `preview/[projectId]/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { getProject, getActiveRevision, getLines } from "@/server/queries/projects";
import { db } from "@/db/client";
import { user } from "@/db/schema";
import { eq } from "drizzle-orm";
import { PreviewShell } from "@/components/preview/preview-shell";

export default async function PreviewPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;

  const project = await getProject(projectId);
  if (!project) notFound();
  const rev = await getActiveRevision(projectId);
  if (!rev) notFound();
  const lines = await getLines(rev.id);

  let ownerName = "—";
  if (project.ownerId) {
    const [owner] = await db.select({ name: user.name }).from(user).where(eq(user.id, project.ownerId)).limit(1);
    ownerName = owner?.name ?? "—";
  }

  return (
    <PreviewShell
      projectId={project.id}
      projectCode={project.code}
      projectName={project.name}
      projectOwner={ownerName}
      projectTarget={project.targetDate ?? "—"}
      projectQuantity={project.quantity}
      revisionId={rev.id}
      revisionLetter={rev.letter}
      lines={lines as any}
    />
  );
}
```

- [ ] **Step 4: Walk it**

```bash
npm run dev
```

Visit `/preview`, click "Northstar Beacon v3.2". Expected: full preview + cards. Toggle export options — state updates. Click "Generate Excel" — confirmation dialog opens. (Generating without S3 creds will throw — see Task 10 for local-mock guidance.) Stop server.

- [ ] **Step 5: Commit**

```bash
git add src/components/preview/preview-shell.tsx src/app/\(app\)/preview/page.tsx src/app/\(app\)/preview/\[projectId\]/page.tsx
git commit -m "feat(preview): full preview page wired to generate"
```

---

### Task 9: History page + table

**Files:**
- Create: `src/components/history/history-table.tsx`
- Replace: `src/app/(app)/history/page.tsx`

- [ ] **Step 1: Write `history-table.tsx`**

```tsx
import Link from "next/link";
import { Badge } from "@/components/master/status-badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";

type Row = {
  id: string;
  fileName: string;
  generatedAt: Date;
  generatedByName: string | null;
  byteSize: number;
  status: "exported" | "archived" | "failed";
  projectCode: string;
  projectName: string;
  revisionLetter: string;
};

export function HistoryTable({ rows }: { rows: Row[] }) {
  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="bg-[var(--color-surface-2)] text-[11px] uppercase tracking-wider text-[var(--color-text-3)]">
            <th className="px-4 py-2.5 text-left font-medium">BOM</th>
            <th className="px-4 py-2.5 text-left font-medium">Generated</th>
            <th className="px-4 py-2.5 text-left font-medium">By</th>
            <th className="px-4 py-2.5 text-left font-medium">File</th>
            <th className="px-4 py-2.5 text-right font-medium">Size</th>
            <th className="px-4 py-2.5 text-left font-medium">Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="border-b border-[var(--color-line-soft)] last:border-0 hover:bg-[var(--color-surface-2)]">
              <td className="px-4 py-2.5">
                <div className="font-medium">{r.projectName}</div>
                <div className="font-mono text-[11px] text-[var(--color-text-3)]">{r.projectCode} · Rev. {r.revisionLetter}</div>
              </td>
              <td className="px-4 py-2.5 text-[var(--color-text-3)]">{new Date(r.generatedAt).toLocaleString()}</td>
              <td className="px-4 py-2.5">{r.generatedByName ?? "—"}</td>
              <td className="px-4 py-2.5 font-mono text-[11.5px]">{r.fileName}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{(r.byteSize / 1024).toFixed(1)} KB</td>
              <td className="px-4 py-2.5">
                {r.status === "exported" && <Badge tone="success">Exported</Badge>}
                {r.status === "archived" && <Badge tone="gray">Archived</Badge>}
                {r.status === "failed"   && <Badge tone="danger">Failed</Badge>}
              </td>
              <td className="px-4 py-2.5 text-right">
                <Link href={`/api/exports/${r.id}/download`} target="_blank">
                  <Button variant="ghost" size="sm" title="Re-download"><Icon.Download size={14} /></Button>
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Replace `/history/page.tsx`**

```tsx
import { listExports } from "@/server/queries/exports";
import { PageHead } from "@/components/master/page-head";
import { HistoryTable } from "@/components/history/history-table";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";

export default async function HistoryPage() {
  const rows = await listExports();
  return (
    <>
      <PageHead
        title="History"
        subtitle="All previously generated bills of materials. Re-download or audit."
        actions={<Button variant="outline"><Icon.Filter size={14} className="mr-1.5" /> Filter</Button>}
      />
      <HistoryTable rows={rows as any} />
    </>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/history src/app/\(app\)/history/page.tsx
git commit -m "feat(history): exports history page with re-download"
```

---

### Task 10: Local S3 setup notes (MinIO) + smoke

This task documents the local S3 mock. No code changes if you have real AWS creds; otherwise add MinIO to docker-compose so the Generate button works locally.

**Files:**
- Modify: `docker-compose.yml`
- Modify: `.env.example`
- Create: `scripts/init-s3-bucket.sh`

- [ ] **Step 1: Add MinIO to compose**

Append to `docker-compose.yml` `services:`:

```yaml
  s3:
    image: minio/minio:RELEASE.2025-01-20T00-00-00Z
    container_name: bom-minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minio
      MINIO_ROOT_PASSWORD: minio12345
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - bom-miniodata:/data
```

And add `bom-miniodata:` under `volumes:`.

- [ ] **Step 2: Update `.env.example`**

Replace the AWS block with:

```bash
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=minio
AWS_SECRET_ACCESS_KEY=minio12345
AWS_S3_ENDPOINT=http://localhost:9000
S3_BUCKET=bom-studio-dev
S3_FORCE_PATH_STYLE=true
```

Update `src/lib/env.ts` to add:

```ts
AWS_S3_ENDPOINT: z.string().url().optional(),
S3_FORCE_PATH_STYLE: z.string().optional(),
```

Update `src/lib/s3.ts` constructor to honor the optional endpoint:

```ts
export const s3 = new S3Client({
  region: env.AWS_REGION,
  credentials,
  endpoint: env.AWS_S3_ENDPOINT,
  forcePathStyle: env.S3_FORCE_PATH_STYLE === "true",
});
```

- [ ] **Step 3: Bucket bootstrap**

`scripts/init-s3-bucket.sh`:

```bash
#!/usr/bin/env bash
set -e
docker run --rm --network host \
  -e AWS_ACCESS_KEY_ID=minio \
  -e AWS_SECRET_ACCESS_KEY=minio12345 \
  amazon/aws-cli s3api create-bucket --bucket bom-studio-dev --endpoint-url http://localhost:9000 || true
echo "bucket bom-studio-dev ready"
```

Make executable and run:

```bash
chmod +x scripts/init-s3-bucket.sh
docker compose up -d s3
./scripts/init-s3-bucket.sh
```

- [ ] **Step 4: Smoke**

```bash
npm run dev
```

Sign in, open `/preview/<id>`, click Generate. Expected: confirmation dialog, then a toast and a new browser tab opening the presigned URL pointing to MinIO. The history page lists the new export.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml .env.example src/lib/env.ts src/lib/s3.ts scripts/init-s3-bucket.sh
git commit -m "chore(s3): MinIO local override for end-to-end exports"
```

---

### Task 11: E2E — full builder → preview → generate → history

**Files:**
- Create: `tests/e2e/preview.spec.ts`

- [ ] **Step 1: Write the e2e**

```ts
import { test, expect } from "@playwright/test";
import { signUpAndGo } from "./helpers";

test("user can preview a project, generate an export, and see it in history", async ({ page }) => {
  await signUpAndGo(page, "/builder");
  await page.getByText("Northstar Beacon v3.2").click();
  await page.getByRole("button", { name: /Preview/ }).click();
  await expect(page.getByRole("heading", { name: /Preview & Generate/ })).toBeVisible();

  await page.getByRole("button", { name: /Generate Excel/ }).click();
  // In the dialog, click the second "Generate" button.
  await page.getByRole("button", { name: /Generate & download/ }).click();
  await expect(page).toHaveURL(/\/history/);
  await expect(page.getByText(/BOM_NB-2412_Rev_A\.xlsx/)).toBeVisible();
});
```

- [ ] **Step 2: Run**

```bash
docker compose up -d db s3
./scripts/init-s3-bucket.sh
npm run db:seed
npm run test:e2e -- preview
```

Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/preview.spec.ts
git commit -m "test(e2e): preview → generate → history flow"
```

---

## Self-review

- **Spec coverage:** preview document layout, summary, options, generate modal, history with re-download — all match `sample-designe/page-preview.jsx` and `page-other.jsx` (History portion). The "Group by vendor (separate sheets)" option is honored both in UI and in the workbook.
- **Placeholders:** none — every step has runnable commands or full code.
- **Type consistency:** `ExportOpts.format` is used for the picker; `generateExport` only consumes the four boolean options (xlsx is forced — the disabled CSV/PDF options match the design state).
- **Risk called out:** the e2e test relies on MinIO being up and the bucket being created. The `init-s3-bucket.sh` script is idempotent.

## Definition of done

- `/preview/<id>` shows the document preview, summary, options, approvers cards.
- Clicking "Generate Excel" produces a real .xlsx, uploads it to S3 (or MinIO), persists a `bom_export` row, redirects to `/history`, and opens the presigned download.
- `/history` lists exports with a working re-download.
- All Vitest and Playwright suites are green.
