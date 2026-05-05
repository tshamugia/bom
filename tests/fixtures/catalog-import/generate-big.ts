import ExcelJS from "exceljs";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const TEMPLATE_COLUMNS = [
  "sku", "description", "manufacturer", "unit",
  "vendor_code", "category", "subcategory",
] as const;

const OUT = join(process.cwd(), "tests/fixtures/catalog-import");

async function main() {
  mkdirSync(OUT, { recursive: true });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("items");
  ws.addRow([...TEMPLATE_COLUMNS]);
  for (let i = 0; i < 5000; i++) {
    ws.addRow([`PERF-${i.toString().padStart(5, "0")}`, "perf row", "Mfg", "pcs", "MSR", "Passive", "Resistors"]);
  }
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  writeFileSync(join(OUT, "big.xlsx"), buf);
  console.log("Wrote", buf.byteLength, "bytes");
}

if (process.argv[1]?.endsWith("generate-big.ts")) main();
