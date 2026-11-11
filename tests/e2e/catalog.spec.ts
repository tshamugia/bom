import { test, expect } from "@playwright/test";
import { signInAndGo } from "./helpers";

// Items come from src/db/seed-items-data.ts (BMS, El and Fire categories).
test("catalog lists the seeded items and the category buttons filter them", async ({ page }) => {
  await signInAndGo(page, "/catalog");
  await expect(page.getByRole("heading", { name: "Item Catalog" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "BMS-DDC-16", exact: true })).toBeVisible();

  await page.getByRole("button", { name: /^Fire · \d+$/ }).click();
  await expect(page).toHaveURL(/\/catalog\?cat=/);
  await expect(page.getByRole("cell", { name: "BMS-DDC-16", exact: true })).toHaveCount(0);
  await expect(page.getByRole("cell", { name: "FD-SMK-2251", exact: true })).toBeVisible();
});
