import { test, expect } from "@playwright/test";
import { signUpAndGo } from "./helpers";

test("user can open a seeded project, change a qty, add and remove a line", async ({ page }) => {
  await signUpAndGo(page, "/builder");
  await page.getByText("Northstar Beacon v3.2").click();
  await expect(page.getByRole("heading", { name: /Northstar Beacon v3\.2/ })).toBeVisible();

  // Change qty for first row.
  const firstQty = page.locator("input[type=number]").first();
  await firstQty.fill("9");
  await firstQty.blur();
  await expect(firstQty).toHaveValue("9");

  // Add a new line via search.
  await page.getByPlaceholder(/Search SKU, description/).fill("DCDC-MP1584");
  await page.getByText("DC-DC Buck Converter").click();
  await expect(page.getByText("DCDC-MP1584")).toBeVisible();

  // Remove that line.
  const row = page.locator("tr", { hasText: "DCDC-MP1584" });
  await row.hover();
  await row.locator("button").last().click();
  await expect(page.getByText("DCDC-MP1584")).toHaveCount(0);
});
