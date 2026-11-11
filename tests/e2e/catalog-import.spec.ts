import { test, expect } from "@playwright/test";
import ExcelJS from "exceljs";
import path from "node:path";
import { signInAndGo } from "./helpers";

const HEADER = ["sku", "description", "manufacturer", "unit", "vendor_code", "category", "subcategory"];

// A file of its own per run, with a new vendor and category, so the dry run always has
// something to add and create — also on a dev database that ran the suite before.
// Everything is named E2E…; seed-e2e.ts removes it before the next run.
test("catalog import: dry-run, commit, dashboard reflects audit entry", async ({ page }, testInfo) => {
  const run = Date.now().toString(36).toUpperCase();
  const sku = `E2E-${run}-1`;
  const file = testInfo.outputPath("import.xlsx");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Items");
  ws.addRow(HEADER);
  ws.addRow([sku, "E2E thermistor", "TDK", "pcs", `E2E${run}`, `E2E Sensors ${run}`, "Pressure"]);
  ws.addRow([`E2E-${run}-2`, "E2E limit switch", "Omron", "pcs", `E2E${run}`, `E2E Sensors ${run}`, ""]);
  await wb.xlsx.writeFile(file);

  await signInAndGo(page, "/catalog");
  await page.getByRole("link", { name: /Import/ }).click();
  await expect(page).toHaveURL(/\/catalog\/import$/);

  await page.locator('input[type="file"]').setInputFiles(file);

  await expect(page).toHaveURL(/\/catalog\/import\?id=/);
  await expect(page.getByText("Total rows")).toBeVisible();
  await expect(page.getByText("To add")).toBeVisible();
  await expect(page.getByText(/Will create 1 vendor, 1 category, 1 subcategory/)).toBeVisible();

  await page.getByRole("button", { name: /^Import$/ }).click();
  await expect(page).toHaveURL(/\/catalog$/);
  // The list shows the first items only; search to find the new one.
  await page.getByPlaceholder(/Search SKU, description, manufacturer/).fill(sku);
  await expect(page.getByRole("cell", { name: sku, exact: true })).toBeVisible();

  await page.goto("/dashboard");
  await expect(page.getByText(/Imported \d+ items/).first()).toBeVisible();
});

test("catalog import: header mismatch shows diff", async ({ page }) => {
  await signInAndGo(page, "/catalog/import");
  await page.locator('input[type="file"]').setInputFiles(path.resolve("tests/fixtures/catalog-import/header-mismatch.xlsx"));
  await expect(page.getByText(/Header row doesn't match/i)).toBeVisible();
});

test("catalog import: errors flagged in preview", async ({ page }) => {
  await signInAndGo(page, "/catalog/import");
  await page.locator('input[type="file"]').setInputFiles(path.resolve("tests/fixtures/catalog-import/with-errors.xlsx"));
  await expect(page).toHaveURL(/\/catalog\/import\?id=/);
  await expect(page.getByText(/rows with errors/)).toBeVisible();
  await expect(page.getByText("missing_required")).toBeVisible();
  await expect(page.getByText("duplicate_in_file")).toBeVisible();
});
