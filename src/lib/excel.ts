import ExcelJS from "exceljs";

export type BomRow = {
  sku: string;
  description: string;
  manufacturer: string;
  vendor: string | null;
  unit: string;
  qty: number;
  sectionName: string | null;
  sectionPosition: number | null;
};

export type ExportColumnKey =
  | "sku"
  | "description"
  | "manufacturer"
  | "vendor"
  | "unit"
  | "qty";

export type ExportColumns = Record<ExportColumnKey, boolean>;

export type BuildOptions = {
  columns: ExportColumns;
  groupByVendor: boolean;
  includeCoverPage: boolean;
};

export type BuildInput = {
  project: { code: string; name: string; owner: string; target: string };
  revisionLetter: string;
  rows: BomRow[];
  options: BuildOptions;
  isDraft?: boolean;
};

type ColumnDescriptor = {
  key: ExportColumnKey;
  header: string;
  width: number;
  align?: "right";
};

const COLUMN_DESCRIPTORS: Record<ExportColumnKey, ColumnDescriptor> = {
  sku:          { key: "sku",          header: "SKU",          width: 18 },
  description:  { key: "description",  header: "Description",  width: 38 },
  manufacturer: { key: "manufacturer", header: "Manufacturer", width: 18 },
  vendor:       { key: "vendor",       header: "Vendor",       width: 22 },
  unit:         { key: "unit",         header: "Unit",         width: 8 },
  qty:          { key: "qty",          header: "Qty",          width: 8, align: "right" },
};

const COLUMN_ORDER: ExportColumnKey[] = [
  "sku",
  "description",
  "unit",
  "qty",
  "manufacturer",
  "vendor",
];

function selectedColumns(opts: BuildOptions): ColumnDescriptor[] {
  return COLUMN_ORDER.filter(k => opts.columns[k]).map(k => COLUMN_DESCRIPTORS[k]);
}

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

type Group = { name: string | null; rows: BomRow[] };

function groupBySection(rows: BomRow[]): Group[] {
  const uncat = rows.filter(r => r.sectionName === null);
  const namedMap = new Map<string, { name: string; position: number; rows: BomRow[] }>();
  for (const r of rows) {
    if (r.sectionName === null) continue;
    const key = r.sectionName;
    if (!namedMap.has(key)) {
      namedMap.set(key, { name: r.sectionName, position: r.sectionPosition ?? 0, rows: [] });
    }
    namedMap.get(key)!.rows.push(r);
  }
  const named = [...namedMap.values()].sort((a, b) => a.position - b.position);

  const groups: Group[] = [];
  if (uncat.length > 0) groups.push({ name: null, rows: uncat });
  for (const g of named) groups.push({ name: g.name, rows: g.rows });
  return groups;
}

function buildCoverSheet(wb: ExcelJS.Workbook, input: BuildInput) {
  const ws = wb.addWorksheet("Cover");
  if (input.isDraft) {
    const band = ws.getRow(1);
    band.getCell(1).value = "DRAFT — NOT FOR PROCUREMENT";
    band.getCell(1).font = { bold: true, color: { argb: "FFFFFFFF" }, size: 14 };
    band.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB91C1C" } };
    band.getCell(1).alignment = { horizontal: "center" };
    ws.mergeCells(1, 1, 1, 6);
    band.height = 28;
    ws.getCell("A2").value = "Bill of Materials";
    ws.getCell("A2").font = { bold: true, size: 22 };
    ws.getCell("A4").value = `${input.project.code} — ${input.project.name}`;
    ws.getCell("A5").value = `Revision ${input.revisionLetter}`;
    ws.getCell("A6").value = `Owner: ${input.project.owner}`;
    ws.getCell("A7").value = `Target: ${input.project.target}`;
  } else {
    ws.getCell("A1").value = "Bill of Materials";
    ws.getCell("A1").font = { bold: true, size: 22 };
    ws.getCell("A3").value = `${input.project.code} — ${input.project.name}`;
    ws.getCell("A4").value = `Revision ${input.revisionLetter}`;
    ws.getCell("A5").value = `Owner: ${input.project.owner}`;
    ws.getCell("A6").value = `Target: ${input.project.target}`;
  }

  const groups = groupBySection(input.rows);
  let row = 8;
  if (groups.length > 0) {
    ws.getCell(`A${row}`).value = "Sections";
    ws.getCell(`A${row}`).font = { bold: true, size: 12 };
    row++;
    for (const g of groups) {
      const label = g.name ?? "Uncategorized";
      const lineCount = g.rows.length;
      ws.getCell(`A${row}`).value = label;
      ws.getCell(`B${row}`).value = `${lineCount} line${lineCount === 1 ? "" : "s"}`;
      row++;
    }
    row++;
  }

  ws.getCell(`A${row}`).value = "Halcyon Robotics";
  ws.getCell(`A${row}`).font = { bold: true };
  ws.getCell(`A${row + 1}`).value = "438 Industrial Way · Oakland, CA";
  ws.getColumn(1).width = 40;
  ws.getColumn(2).width = 16;
}

function buildMainSheet(wb: ExcelJS.Workbook, input: BuildInput, name = "BOM") {
  const ws = wb.addWorksheet(name);

  const cols = selectedColumns(input.options);
  const indexColIndex = 1;
  const dataColStart = 2;
  const colIndexByKey = new Map<ExportColumnKey, number>();
  cols.forEach((c, i) => colIndexByKey.set(c.key, dataColStart + i));

  const headers = ["#", ...cols.map(c => c.header)];
  const lastVisibleColIndex = headers.length;
  const lastColLetter = colLetter(lastVisibleColIndex);

  ws.mergeCells(`A1:${lastColLetter}1`);
  ws.getCell("A1").value = "Bill of Materials";
  ws.getCell("A1").font = { bold: true, size: 16 };

  ws.mergeCells(`A2:${lastColLetter}2`);
  ws.getCell("A2").value = `${input.project.code} — ${input.project.name}  ·  Rev. ${input.revisionLetter}`;
  ws.getCell("A2").font = { color: { argb: "FF6B7180" }, size: 11 };

  ws.mergeCells(`A3:${lastColLetter}3`);
  ws.getCell("A3").value = `Owner: ${input.project.owner}   Target: ${input.project.target}`;
  ws.getCell("A3").font = { color: { argb: "FF6B7180" }, size: 10 };

  const headerRow = ws.getRow(5);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: "FF6B7180" }, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFECEEF2" } };
    cell.alignment = { vertical: "middle", horizontal: i === 0 ? undefined : alignFor(cols[i - 1]) };
    cell.border = { bottom: { style: "thin", color: { argb: "FFE4E6EB" } } };
  });

  const groups = groupBySection(input.rows);
  let currentRow = 6;
  let groupIndex = 0;

  for (const group of groups) {
    const onlyUncategorized = groups.length === 1 && groups[0].name === null;
    if (!onlyUncategorized) {
      const headingRow = ws.getRow(currentRow);
      ws.mergeCells(`A${currentRow}:${lastColLetter}${currentRow}`);
      const headingCell = headingRow.getCell(1);
      headingCell.value = group.name ?? "Uncategorized";
      headingCell.font = { bold: true, size: 11, italic: group.name === null };
      headingCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFECEEF2" } };
      headingCell.border = { top: { style: "thin", color: { argb: "FFD0D4DB" } } };
      if (groupIndex > 0) {
        const prev = ws.getRow(currentRow - 1);
        prev.addPageBreak();
      }
      currentRow++;
    }

    group.rows.forEach((r, idx) => {
      const row = ws.getRow(currentRow);
      row.getCell(indexColIndex).value = idx + 1;
      for (const c of cols) {
        const colIdx = colIndexByKey.get(c.key)!;
        const cell = row.getCell(colIdx);
        switch (c.key) {
          case "sku":          cell.value = r.sku; break;
          case "description":  cell.value = r.description; break;
          case "manufacturer": cell.value = r.manufacturer; break;
          case "vendor":       cell.value = r.vendor ?? "—"; break;
          case "unit":         cell.value = r.unit; break;
          case "qty":          cell.value = r.qty; break;
        }
      }
      currentRow++;
    });

    groupIndex++;
  }

  ws.getColumn(indexColIndex).width = 4;
  cols.forEach((c, i) => {
    ws.getColumn(dataColStart + i).width = c.width;
  });

  if (input.isDraft) {
    ws.headerFooter.oddFooter =
      `&L&"Arial,Bold"&CDraft snapshot · ${new Date().toISOString().slice(0, 10)} · Owner: ${input.project.owner}`;
  }

  ws.views = [{ state: "frozen", ySplit: 5 }];
}

function alignFor(c: ColumnDescriptor): "right" | undefined {
  return c.align;
}

function colLetter(index: number): string {
  let n = index;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export type CatalogExportRow = {
  sku: string;
  description: string;
  manufacturer: string;
  unit: string;
  vendor: string | null;
  category: string | null;
  subcategory: string | null;
};

export async function buildCatalogWorkbook(rows: CatalogExportRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "BOM Studio";
  wb.created = new Date();

  const ws = wb.addWorksheet("Catalog");
  const headers = ["SKU", "Description", "Manufacturer", "Unit", "Vendor", "Category", "Subcategory"];
  const widths = [18, 40, 22, 8, 24, 22, 22];

  const headerRow = ws.getRow(1);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: "FF6B7180" }, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFECEEF2" } };
    cell.border = { bottom: { style: "thin", color: { argb: "FFE4E6EB" } } };
  });

  rows.forEach((r, i) => {
    const row = ws.getRow(2 + i);
    row.getCell(1).value = r.sku;
    row.getCell(2).value = r.description;
    row.getCell(3).value = r.manufacturer;
    row.getCell(4).value = r.unit;
    row.getCell(5).value = r.vendor ?? "—";
    row.getCell(6).value = r.category ?? "—";
    row.getCell(7).value = r.subcategory ?? "—";
  });

  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.views = [{ state: "frozen", ySplit: 1 }];

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

export type VendorExportRow = {
  name: string;
  code: string;
  country: string;
  leadTime: string;
  rating: number;
  status: string;
  itemsCount: number;
};

export async function buildVendorWorkbook(rows: VendorExportRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "BOM Studio";
  wb.created = new Date();

  const ws = wb.addWorksheet("Vendors");
  const headers = ["Name", "Code", "Country", "Lead time", "Rating", "Status", "Items"];
  const widths = [28, 14, 14, 14, 10, 14, 10];

  const headerRow = ws.getRow(1);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: "FF6B7180" }, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFECEEF2" } };
    cell.border = { bottom: { style: "thin", color: { argb: "FFE4E6EB" } } };
  });

  rows.forEach((r, i) => {
    const row = ws.getRow(2 + i);
    row.getCell(1).value = r.name;
    row.getCell(2).value = r.code;
    row.getCell(3).value = r.country;
    row.getCell(4).value = r.leadTime;
    row.getCell(5).value = Number(r.rating);
    row.getCell(5).numFmt = "0.0";
    row.getCell(6).value = r.status;
    row.getCell(7).value = r.itemsCount;
  });

  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.views = [{ state: "frozen", ySplit: 1 }];

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
