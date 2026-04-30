import { test, expect } from "@playwright/test";
import { signUpAndGo } from "./helpers";

test("catalog renders seeded items and category tabs filter", async ({ page }) => {
  await signUpAndGo(page, "/catalog");
  await expect(page.getByRole("heading", { name: "Item Catalog" })).toBeVisible();
  await expect(page.getByText("RES-0805-10K-1")).toBeVisible();
  await page.getByRole("button", { name: /Semiconductors/ }).click();
  await expect(page).toHaveURL(/\/catalog\?cat=/);
  await expect(page.getByText("RES-0805-10K-1")).toHaveCount(0);
  await expect(page.getByText("MCU-STM32G0")).toBeVisible();
});
