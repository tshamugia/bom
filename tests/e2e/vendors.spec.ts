import { test, expect } from "@playwright/test";
import { signUpAndGo } from "./helpers";

test("can add a vendor and see it in the table", async ({ page }) => {
  const name = `Acme Parts ${Date.now()}`;
  await signUpAndGo(page, "/vendors");
  await page.getByRole("button", { name: /Add vendor/ }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Code").fill("ACM");
  await page.getByLabel(/Country/).fill("US");
  await page.getByLabel("Lead time").fill("3-4d");
  await page.getByLabel("Rating").fill("4.5");
  await page.getByRole("button", { name: /Create/ }).click();
  await expect(page.getByText(name)).toBeVisible();
});
