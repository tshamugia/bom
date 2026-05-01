import { test, expect } from "@playwright/test";
import { signUpAndGo } from "./helpers";

test("user can preview a project, generate an export, and see it in history", async ({ page }) => {
  test.setTimeout(120_000);
  await signUpAndGo(page, "/builder");
  await page.getByText("Northstar Beacon v3.2").click();
  await page.getByRole("button", { name: /Preview/ }).click();
  await expect(page.getByRole("heading", { name: /Preview & Generate/ })).toBeVisible({ timeout: 60_000 });

  await page.getByRole("button", { name: /Generate Excel/ }).click();
  await page.getByRole("button", { name: /Generate & download/ }).click();
  await expect(page).toHaveURL(/\/history/, { timeout: 60_000 });
  await expect(page.getByRole("cell", { name: /BOM_NB-2412_Rev_A\.xlsx/ }).first()).toBeVisible();
});
