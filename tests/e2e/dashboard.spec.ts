import { test, expect } from "@playwright/test";
import { signInAndGo } from "./helpers";
import { scenario } from "./e2e-data";

test("dashboard shows the KPIs and projects, and recent activity picks up a new vendor", async ({ page }) => {
  // E2E… codes are removed by seed-e2e.ts before the next run.
  const vendor = `E2E Recent Vendor ${Date.now()}`;
  await signInAndGo(page, "/dashboard");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText("Active BOMs", { exact: true })).toBeVisible();
  await expect(page.getByText("Approvals pending", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(`^${scenario("builder").project}\\b`) })).toBeVisible();

  await page.goto("/vendors");
  await page.getByRole("button", { name: /Add vendor/ }).click();
  await page.getByLabel("Name").fill(vendor);
  await page.getByLabel("Code").fill("E2ERV");
  await page.getByLabel(/Country/).fill("US");
  await page.getByLabel("Lead time").fill("5d");
  await page.getByLabel("Rating").fill("4");
  await page.getByRole("button", { name: /Create/ }).click();
  await expect(page.getByText(vendor)).toBeVisible();

  await page.goto("/dashboard");
  await expect(page.getByText(`Vendor ${vendor} added`)).toBeVisible();
});
