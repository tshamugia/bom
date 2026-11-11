import { test, expect } from "@playwright/test";
import { openBom } from "./helpers";
import { ADD_ITEM, scenario } from "./e2e-data";

test("change a quantity, then add a catalog item and remove it again", async ({ page }) => {
  await openBom(page, scenario("builder").bom);

  const firstQty = page.getByRole("spinbutton").first();
  await firstQty.fill("9");
  await firstQty.blur();
  await expect(firstQty).toHaveValue("9");

  await page.getByPlaceholder(/Search SKU, description/).fill(ADD_ITEM.sku);
  await page.getByText(ADD_ITEM.description).first().click();
  const row = page.getByRole("row").filter({ hasText: ADD_ITEM.sku });
  await expect(row).toBeVisible();

  await row.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("row").filter({ hasText: ADD_ITEM.sku })).toHaveCount(0);
});
