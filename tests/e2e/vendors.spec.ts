import { test, expect } from "@playwright/test";
import { signInAndGo } from "./helpers";

test("can add a vendor and see it in the table", async ({ page }) => {
  // E2E… codes are removed by seed-e2e.ts before the next run.
  const name = `E2E Vendor ${Date.now()}`;
  await signInAndGo(page, "/vendors");
  await page.getByRole("button", { name: /Add vendor/ }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Code").fill("E2EV");
  await page.getByLabel(/Country/).fill("US");
  await page.getByLabel("Lead time").fill("3-4d");
  await page.getByLabel("Rating").fill("4.5");
  await page.getByRole("button", { name: /Create/ }).click();
  await expect(page.getByText(name)).toBeVisible();
});
