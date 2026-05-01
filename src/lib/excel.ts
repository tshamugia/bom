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

  ws.mergeCells("A1:H1");
  ws.getCell("A1").value = "Bill of Materials";
  ws.getCell("A1").font = { bold: true, size: 16 };

  ws.mergeCells("A2:H2");
  ws.getCell("A2").value = `${input.project.code} — ${input.project.name}  ·  Rev. ${input.revisionLetter}`;
  ws.getCell("A2").font = { color: { argb: "FF6B7180" }, size: 11 };

  ws.mergeCells("A3:H3");
  ws.getCell("A3").value = `Owner: ${input.project.owner}   Target: ${input.project.target}   Build qty: ${input.project.quantity}`;
  ws.getCell("A3").font = { color: { argb: "FF6B7180" }, size: 10 };

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

  [4, 18, 38, 18, 22, 6, 8, 12, 12, 14].forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  ws.views = [{ state: "frozen", ySplit: 5 }];
}
