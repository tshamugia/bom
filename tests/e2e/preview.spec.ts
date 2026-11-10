import { test, expect } from "@playwright/test";
import { openBom } from "./helpers";
import { scenario } from "./e2e-data";

const { bom, projectCode } = scenario("preview");
// A draft export is marked as such: BOM_<project code>_<label>_DRAFT_<date>.xlsx
const FILE = new RegExp(`^BOM_${projectCode}_P01_DRAFT_\\d{4}-\\d{2}-\\d{2}\\.xlsx$`);

test("preview a BOM, generate the Excel export, and download it again from History", async ({ page }) => {
  test.setTimeout(90_000);
  await openBom(page, bom);
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Preview & Generate" })).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: /Generate Excel/ }).click();
  const download = page.waitForEvent("download", { timeout: 60_000 });
  await page.getByRole("button", { name: /Generate & download/ }).click();
  const fileName = (await download).suggestedFilename();
  expect(fileName).toMatch(FILE);

  await expect(page).toHaveURL(/\/history/, { timeout: 30_000 });
  await expect(page.getByRole("cell", { name: fileName }).first()).toBeVisible();

  // Exports aren't stored: History rebuilds the file on the fly.
  const again = page.waitForEvent("download", { timeout: 60_000 });
  await page.getByTitle("Re-download").first().click();
  expect((await again).suggestedFilename()).toMatch(FILE);
});
