import ExcelJS from "exceljs";
import { writeFileSync } from "node:fs";
import { TEMPLATE_COLUMNS } from "@/lib/schemas/import";

export async function buildTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "BOM Studio";
  const ws = wb.addWorksheet("items");
  ws.addRow([...TEMPLATE_COLUMNS]);
  ws.getRow(1).font = { bold: true };
  ws.addRow(["RES-0805-10K-1", "10kΩ resistor 0805", "Yageo",  "pcs", "MSR", "Passive",        "Resistors"]);
  ws.addRow(["CAP-0603-100N-1", "100nF cap 0603",     "Murata", "pcs", "MSR", "Passive",        "Capacitors"]);
  ws.addRow(["MCU-STM32G0",     "STM32G0 32-bit MCU", "ST",     "pcs", "DK",  "Semiconductors", "Microcontrollers"]);
  [18, 38, 18, 6, 14, 18, 18].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

if (process.argv[1]?.endsWith("import-template.ts")) {
  buildTemplate().then(buf => {
    writeFileSync("public/templates/catalog-import-template.xlsx", buf);
    console.log("wrote public/templates/catalog-import-template.xlsx");
  });
}
