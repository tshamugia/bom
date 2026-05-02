import ExcelJS from "exceljs";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const TEMPLATE_COLUMNS = [
  "sku", "description", "manufacturer", "unit",
  "unit_price", "on_hand", "stock_state",
  "vendor_code", "category", "subcategory",
] as const;

const OUT = join(process.cwd(), "tests/fixtures/catalog-import");

async function makeWorkbook(rows: (string | number)[][], headers: string[] = [...TEMPLATE_COLUMNS]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("items");
  ws.addRow(headers);
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  writeFileSync(join(OUT, "good.xlsx"), await makeWorkbook([
    ["FX-RES-1", "10k resistor",  "Yageo",  "pcs", 0.012, 100, "in-stock", "MSR", "Passive", "Resistors"],
    ["FX-CAP-1", "100nF cap",     "Murata", "pcs", 0.018, 80,  "in-stock", "MSR", "Passive", "Capacitors"],
    ["FX-IC-1",  "STM32G0",       "ST",     "pcs", 1.85,  20,  "low-stock","DK",  "Semiconductors", "Microcontrollers"],
    ["FX-NEW-1", "thermistor",    "TDK",    "pcs", 0.5,   10,  "in-stock", "FXNEWCO", "Sensors", "Pressure"],
    ["FX-NEW-2", "limit switch",  "Omron",  "pcs", 1.2,   30,  "in-stock", "FXNEWCO", "Mechanical", ""],
  ]));

  writeFileSync(join(OUT, "with-errors.xlsx"), await makeWorkbook([
    ["FX-OK-1", "ok row",      "m",    "pcs", 1,      0, "in-stock", "", "", ""],
    ["",        "missing sku", "m",    "pcs", 1,      0, "in-stock", "", "", ""],
    ["FX-BAD",  "bad price",   "m",    "pcs", "$1.0", 0, "in-stock", "", "", ""],
    ["FX-BAD2", "bad enum",    "m",    "pcs", 1,      0, "weird",    "", "", ""],
    ["FX-BAD3", "orphan sub",  "m",    "pcs", 1,      0, "in-stock", "", "", "Resistors"],
  ]));

  writeFileSync(join(OUT, "header-mismatch.xlsx"), await makeWorkbook([], ["sku", "qty"]));

  console.log("Fixtures written to", OUT);
}

if (process.argv[1]?.endsWith("generate-fixtures.ts")) main();
