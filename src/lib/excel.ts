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
  sectionName: string | null;
  sectionPosition: number | null;
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
  isDraft?: boolean;
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
  ws.getCell("A1").value = "Bill of Materials";
  ws.getCell("A1").font = { bold: true, size: 22 };
  ws.getCell("A3").value = `${input.project.code} — ${input.project.name}`;
  ws.getCell("A4").value = `Revision ${input.revisionLetter} · Build qty ${input.project.quantity}`;
  ws.getCell("A5").value = `Owner: ${input.project.owner}`;
  ws.getCell("A6").value = `Target: ${input.project.target}`;

  const groups = groupBySection(input.rows);
  let row = 8;
  if (groups.length > 0) {
    ws.getCell(`A${row}`).value = "Sections";
    ws.getCell(`A${row}`).font = { bold: true, size: 12 };
    row++;
    for (const g of groups) {
      const label = g.name ?? "Uncategorized";
      const lineCount = g.rows.length;
      const total = g.rows.reduce((s, r) => s + r.qty * r.unitPrice, 0);
      ws.getCell(`A${row}`).value = label;
      ws.getCell(`B${row}`).value = `${lineCount} line${lineCount === 1 ? "" : "s"}`;
      if (input.options.includeVendorPricing) {
        ws.getCell(`C${row}`).value = total;
        ws.getCell(`C${row}`).numFmt = '"$"#,##0.00';
      }
      row++;
    }
    row++;
  }

  ws.getCell(`A${row}`).value = "Halcyon Robotics";
  ws.getCell(`A${row}`).font = { bold: true };
  ws.getCell(`A${row + 1}`).value = "438 Industrial Way · Oakland, CA";
  ws.getColumn(1).width = 40;
  ws.getColumn(2).width = 16;
  ws.getColumn(3).width = 16;
}

function buildMainSheet(wb: ExcelJS.Workbook, input: BuildInput, name = "BOM") {
  const ws = wb.addWorksheet(name);

  // Header block (rows 1-3) and column header (row 5).
  const headers = ["#", "SKU", "Description", "Manufacturer", "Vendor", "Unit", "Qty"];
  if (input.options.includeVendorPricing) headers.push("Unit price", "Total");
  if (input.options.includeStockAvailability) headers.push("Stock");
  // The total column is always the LAST column when includeVendorPricing, indexed 1-based.
  // Column letter for "Total" depends on how many columns are included. We use indices.
  const totalColIndex = input.options.includeVendorPricing ? headers.indexOf("Total") + 1 : null; // 1-based
  const subtotalColIndex = totalColIndex ? totalColIndex + 1 : null; // column J relative to whatever Total ended up being
  const lastVisibleColIndex = headers.length;
  // mergeCells uses A1 notation; compute the last column letter for merges.
  const lastColLetter = colLetter(lastVisibleColIndex);

  ws.mergeCells(`A1:${lastColLetter}1`);
  ws.getCell("A1").value = "Bill of Materials";
  ws.getCell("A1").font = { bold: true, size: 16 };

  ws.mergeCells(`A2:${lastColLetter}2`);
  ws.getCell("A2").value = `${input.project.code} — ${input.project.name}  ·  Rev. ${input.revisionLetter}`;
  ws.getCell("A2").font = { color: { argb: "FF6B7180" }, size: 11 };

  ws.mergeCells(`A3:${lastColLetter}3`);
  ws.getCell("A3").value = `Owner: ${input.project.owner}   Target: ${input.project.target}   Build qty: ${input.project.quantity}`;
  ws.getCell("A3").font = { color: { argb: "FF6B7180" }, size: 10 };

  const headerRow = ws.getRow(5);
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: "FF6B7180" }, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFECEEF2" } };
    cell.alignment = { vertical: "middle" };
    cell.border = { bottom: { style: "thin", color: { argb: "FFE4E6EB" } } };
  });

  const groups = groupBySection(input.rows);
  let currentRow = 6;
  let firstDataRow: number | null = null;
  let lastDataRow: number | null = null;
  let groupIndex = 0;

  for (const group of groups) {
    // Section heading row (only if there are any groups - even Uncategorized gets one
    // when other named sections exist; if everything is uncategorized, skip the heading
    // for backward-compatible flat output).
    const onlyUncategorized = groups.length === 1 && groups[0].name === null;
    if (!onlyUncategorized) {
      const headingRow = ws.getRow(currentRow);
      ws.mergeCells(`A${currentRow}:${lastColLetter}${currentRow}`);
      const headingCell = headingRow.getCell(1);
      headingCell.value = group.name ?? "Uncategorized";
      headingCell.font = { bold: true, size: 11, italic: group.name === null };
      headingCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFECEEF2" } };
      headingCell.border = { top: { style: "thin", color: { argb: "FFD0D4DB" } } };
      // Page break before the heading on every group except the first.
      if (groupIndex > 0) {
        const prev = ws.getRow(currentRow - 1);
        prev.addPageBreak();
      }
      currentRow++;
    }

    const groupFirstDataRow = currentRow;
    group.rows.forEach((r, idx) => {
      const row = ws.getRow(currentRow);
      let col = 1;
      row.getCell(col++).value = idx + 1; // restart per section
      row.getCell(col++).value = r.sku;
      row.getCell(col++).value = r.description;
      row.getCell(col++).value = r.manufacturer;
      row.getCell(col++).value = r.vendor ?? "—";
      row.getCell(col++).value = r.unit;
      row.getCell(col++).value = r.qty;
      if (input.options.includeVendorPricing && totalColIndex) {
        const unitPriceColLetter = colLetter(col);
        row.getCell(col++).value = r.unitPrice;
        // Qty lives in column G (col 7); the Total cell is qty * unit price.
        row.getCell(col).value = {
          formula: `${unitPriceColLetter}${currentRow}*G${currentRow}`,
        };
        col++;
      }
      if (input.options.includeStockAvailability) row.getCell(col++).value = r.stock ?? "";
      if (firstDataRow === null) firstDataRow = currentRow;
      lastDataRow = currentRow;
      currentRow++;
    });
    const groupLastDataRow = currentRow - 1;

    // Per-section subtotal (column J = totalColIndex + 1) when pricing is shown.
    if (input.options.includeVendorPricing && subtotalColIndex && group.rows.length > 0 && !onlyUncategorized) {
      const subtotalRow = ws.getRow(currentRow);
      const labelCell = subtotalRow.getCell(totalColIndex!);
      labelCell.value = `Subtotal — ${group.name ?? "Uncategorized"}`;
      labelCell.font = { italic: true, color: { argb: "FF6B7180" }, size: 10 };
      labelCell.alignment = { horizontal: "right" };
      const totalColLetter = colLetter(totalColIndex!);
      const subCell = subtotalRow.getCell(subtotalColIndex);
      subCell.value = {
        formula: `SUM(${totalColLetter}${groupFirstDataRow}:${totalColLetter}${groupLastDataRow})`,
      };
      subCell.font = { bold: true };
      subCell.numFmt = '"$"#,##0.00';
      currentRow++;
    }

    groupIndex++;
  }

  // Grand total. Heading-row cells in the Total column hold non-numeric merged text,
  // and subtotals live in column J (subtotalColIndex), so SUM over the Total column's
  // full range gives the right number without double-counting.
  if (input.options.includeVendorPricing && firstDataRow !== null && lastDataRow !== null && totalColIndex) {
    const totalsRow = ws.getRow(currentRow + 1);
    const totalColLetter = colLetter(totalColIndex);
    totalsRow.getCell(totalColIndex - 1).value = "Total";
    totalsRow.getCell(totalColIndex - 1).font = { bold: true };
    totalsRow.getCell(totalColIndex - 1).alignment = { horizontal: "right" };
    totalsRow.getCell(totalColIndex).value = {
      formula: `SUM(${totalColLetter}${firstDataRow}:${totalColLetter}${lastDataRow})`,
    };
    totalsRow.getCell(totalColIndex).font = { bold: true };
    totalsRow.getCell(totalColIndex).numFmt = '"$"#,##0.00';
  }

  // Column widths (must cover the J subtotal column when present).
  const widths = [4, 18, 38, 18, 22, 6, 8, 12, 12, 14, 18];
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  ws.views = [{ state: "frozen", ySplit: 5 }];
}

function colLetter(index: number): string {
  // 1 -> A, 26 -> Z, 27 -> AA. Standard A1-notation conversion.
  let n = index;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}
