import { test, expect } from "@playwright/test";
import { signUpAndGo } from "./helpers";

test("user can create a section, set it active, add lines into it, then rename and delete", async ({ page }) => {
  await signUpAndGo(page, "/builder");
  await page.getByText("Northstar Beacon v3.2").click();
  await expect(page.getByRole("heading", { name: /Northstar Beacon v3\.2/ })).toBeVisible();

  // Create a new section.
  await page.getByRole("button", { name: /new section/i }).click();
  await page.getByPlaceholder(/section name/i).fill("Fire Alarm");
  await page.getByRole("button", { name: /^add$/i }).click();
  await expect(page.getByText("Fire Alarm")).toBeVisible();
  // The newly created section is active by default.
  await expect(page.getByText(/active/i).first()).toBeVisible();

  // Add an item via search; it should land in the active section.
  await page.getByPlaceholder(/Search SKU, description/).fill("DCDC-MP1584");
  await page.getByText("DC-DC Buck Converter").click();
  await expect(page.getByText("DCDC-MP1584")).toBeVisible();

  // Rename the section by double-clicking its title.
  await page.getByText("Fire Alarm").dblclick();
  const renameInput = page.locator("input[value='Fire Alarm']");
  await renameInput.fill("Power");
  await renameInput.press("Enter");
  await expect(page.getByText("Power")).toBeVisible();

  // Delete the section, keeping its lines (move to Uncategorized).
  // Open the kebab menu on the section row.
  const sectionHeader = page.locator("tr", { hasText: "Power" });
  await sectionHeader.locator("button[aria-label='Section actions']").click();
  // Confirm dialog uses the native confirm() which Playwright accepts by default.
  page.once("dialog", d => d.accept());
  await page.getByRole("menuitem", { name: /delete \(keep lines\)/i }).click();
  await expect(page.getByText("Power")).toHaveCount(0);
  // Line still exists, now under Uncategorized.
  await expect(page.getByText("Uncategorized")).toBeVisible();
  await expect(page.getByText("DCDC-MP1584")).toBeVisible();
});
