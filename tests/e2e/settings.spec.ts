import { test, expect } from "@playwright/test";
import { signInAndGo } from "./helpers";

// The account menu opens from the sidebar footer; it must render above the
// sidebar (desktop) and the nav drawer (phones), or Settings is unreachable.
test("account menu opens Settings on desktop", async ({ page }) => {
  await signInAndGo(page, "/dashboard");
  await page.getByRole("button", { name: "Open account menu" }).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
});

test("account menu opens Settings from the phone drawer", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAndGo(page, "/dashboard");
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page.getByRole("button", { name: "Open account menu" }).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
});
