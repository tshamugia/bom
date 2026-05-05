import { test, expect } from "@playwright/test";
import { signUpAndGo } from "./helpers";

test("manufacturer is a toggleable column between Vendor and Unit", async ({ page }) => {
  await signUpAndGo(page, "/builder");
  await page.getByText("Northstar Beacon v3.2").click();
  await expect(page.getByRole("heading", { name: /Northstar Beacon v3\.2/ })).toBeVisible();

  // Header is present by default.
  const mfrHeader = page.getByRole("columnheader", { name: "Manufacturer" });
  await expect(mfrHeader).toBeVisible();

  // Header order: Vendor → Manufacturer → Unit.
  const headerTexts = await page.locator("thead th").allInnerTexts();
  const vendorIdx = headerTexts.findIndex(t => /Vendor/i.test(t));
  const mfrIdx = headerTexts.findIndex(t => /Manufacturer/i.test(t));
  const unitIdx = headerTexts.findIndex(t => /^Unit$/i.test(t));
  expect(vendorIdx).toBeGreaterThanOrEqual(0);
  expect(mfrIdx).toBe(vendorIdx + 1);
  expect(unitIdx).toBe(mfrIdx + 1);

  // Description cell no longer carries the muted manufacturer subtitle.
  // Take a row whose manufacturer cell has a non-empty value, and assert the
  // matching Description cell does NOT contain that text as a nested element.
  const firstRow = page.locator("tbody tr").first();
  const sampleMfr = (await firstRow.locator("td").nth(mfrIdx).innerText()).trim();
  if (sampleMfr && sampleMfr !== "—") {
    const descIdx = headerTexts.findIndex(t => /Description/i.test(t));
    const descCellText = await firstRow.locator("td").nth(descIdx).innerText();
    expect(descCellText).not.toContain(sampleMfr);
  }

  // Toggle off via the Columns menu and verify the column disappears.
  await page.getByRole("button", { name: /Columns/ }).click();
  await page.getByRole("menuitemcheckbox", { name: "Manufacturer" }).click();
  await expect(mfrHeader).toHaveCount(0);

  // Toggle back on.
  await page.getByRole("menuitemcheckbox", { name: "Manufacturer" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("columnheader", { name: "Manufacturer" })).toBeVisible();
});
