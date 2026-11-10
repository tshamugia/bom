import { test, expect } from "@playwright/test";
import { openBom } from "./helpers";
import { ADD_ITEM, scenario } from "./e2e-data";

test("create a section, add a line into it, rename it, delete it and keep the line", async ({ page }) => {
  await openBom(page, scenario("sections").bom);

  await page.getByRole("button", { name: "New section" }).click();
  await page.getByPlaceholder(/section name/i).fill("Fire Alarm");
  await page.getByRole("button", { name: /^add$/i }).click();
  await expect(page.getByRole("button", { name: "Fire Alarm" })).toBeVisible();

  // A new section is the active one, so the next line lands in it.
  await page.getByPlaceholder(/Search SKU, description/).fill(ADD_ITEM.sku);
  await page.getByText(ADD_ITEM.description).first().click();
  await expect(page.getByRole("row").filter({ hasText: ADD_ITEM.sku })).toBeVisible();

  // Rename by double-clicking the title.
  await page.getByRole("button", { name: "Fire Alarm" }).dblclick();
  // The value attribute changes as we type, so finish with the keyboard.
  await page.locator("input[value='Fire Alarm']").fill("Power");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Power" })).toBeVisible();

  // Delete the section but keep its lines (they move to Uncategorized).
  const sectionRow = page.getByRole("row").filter({ has: page.getByRole("button", { name: "Power" }) });
  await sectionRow.getByRole("button", { name: "Section actions" }).click();
  page.once("dialog", d => d.accept());
  await page.getByRole("menuitem", { name: /delete \(keep lines\)/i }).click();
  await expect(page.getByRole("button", { name: "Power" })).toHaveCount(0);
  await expect(page.getByText("Uncategorized")).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: ADD_ITEM.sku })).toBeVisible();
});
