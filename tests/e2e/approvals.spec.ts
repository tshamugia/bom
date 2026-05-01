import { test, expect } from "@playwright/test";
import { execSync } from "node:child_process";
import { signUpAndGo } from "./helpers";

// This test locks the seeded Northstar Beacon revision, so re-seed afterwards
// to keep downstream test files (builder, preview) green when running together.
test.afterAll(() => {
  execSync("npm run db:seed", { stdio: "ignore" });
});

test("user can send for review, approve through three stages, and lock the BOM", async ({ page }) => {
  test.setTimeout(120_000);
  await signUpAndGo(page, "/builder");
  await page.getByText("Northstar Beacon v3.2").click();
  await page.getByRole("button", { name: /Preview/ }).click();
  await page.getByRole("button", { name: /Send for review/ }).click();
  await expect(page.locator("[data-sonner-toaster]").getByText(/Sent for review/)).toBeVisible();

  await page.goto("/approvals?tab=you");
  const row = page.getByRole("row", { name: /Northstar Beacon v3\.2/ });
  await expect(row).toBeVisible();

  // Stage 1: Engineering → Procurement
  await expect(row.getByText(/Engineering review/)).toBeVisible();
  await row.getByRole("button", { name: /^Approve$/ }).click();
  await expect(row.getByText(/Procurement review/)).toBeVisible();

  // Stage 2: Procurement → Finance
  await row.getByRole("button", { name: /^Approve$/ }).click();
  await expect(row.getByText(/Finance review/)).toBeVisible();

  // Stage 3: Finance → Approved (row leaves the "Pending you" tab)
  await row.getByRole("button", { name: /^Approve$/ }).click();
  await expect(row).toHaveCount(0);

  // Now in Approved tab.
  await page.goto("/approvals?tab=approved");
  await expect(page.getByText("Northstar Beacon v3.2")).toBeVisible();
});
