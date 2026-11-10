import { test, expect } from "@playwright/test";
import { openBom } from "./helpers";
import { scenario } from "./e2e-data";

test("manufacturer is a toggleable column between Vendor and Unit", async ({ page }) => {
  await openBom(page, scenario("columns").bom);

  const mfrHeader = page.getByRole("columnheader", { name: "Manufacturer" });
  await expect(mfrHeader).toBeVisible();

  // Header order: Vendor → Manufacturer → Unit.
  const headerTexts = (await page.locator("thead th").allInnerTexts()).map(t => t.trim());
  const vendorIdx = headerTexts.findIndex(t => /^Vendor$/i.test(t));
  const mfrIdx = headerTexts.findIndex(t => /^Manufacturer$/i.test(t));
  const unitIdx = headerTexts.findIndex(t => /^Unit$/i.test(t));
  expect(vendorIdx).toBeGreaterThanOrEqual(0);
  expect(mfrIdx).toBe(vendorIdx + 1);
  expect(unitIdx).toBe(mfrIdx + 1);

  // The manufacturer has its own cell; the description no longer repeats it.
  const firstLine = page.getByRole("row").filter({ hasText: "BMS-DDC-16" });
  await expect(firstLine.locator("td").nth(mfrIdx)).toHaveText("Siemens");
  const descIdx = headerTexts.findIndex(t => /^Description$/i.test(t));
  await expect(firstLine.locator("td").nth(descIdx)).not.toContainText("Siemens");

  await page.getByRole("button", { name: "Columns", exact: true }).click();
  await page.getByRole("menuitemcheckbox", { name: "Manufacturer" }).click();
  await expect(mfrHeader).toHaveCount(0);

  await page.getByRole("menuitemcheckbox", { name: "Manufacturer" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("columnheader", { name: "Manufacturer" })).toBeVisible();
});
