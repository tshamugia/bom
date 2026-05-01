import { test, expect } from "@playwright/test";
import { signUpAndGo } from "./helpers";

test("dashboard renders KPIs, projects table, and recent activity reflects a vendor add", async ({ page }) => {
  await signUpAndGo(page, "/dashboard");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText("Active BOMs", { exact: true })).toBeVisible();
  await expect(page.getByText("Open value", { exact: true })).toBeVisible();
  await expect(page.getByText("Approvals pending", { exact: true })).toBeVisible();
  await expect(page.getByText("Northstar Beacon v3.2")).toBeVisible();
  await expect(page.getByText("FER-BLM18-600")).toBeVisible();

  await page.goto("/vendors");
  await page.getByRole("button", { name: /Add vendor/ }).click();
  await page.getByLabel("Name").fill("Recent Vendor X");
  await page.getByLabel("Code").fill("RVX");
  await page.getByLabel(/Country/).fill("US");
  await page.getByLabel("Lead time").fill("5d");
  await page.getByLabel("Rating").fill("4");
  await page.getByRole("button", { name: /Create/ }).click();
  await expect(page.getByText("Recent Vendor X")).toBeVisible();

  await page.goto("/dashboard");
  await expect(page.getByText("Vendor Recent Vendor X added")).toBeVisible();
});
