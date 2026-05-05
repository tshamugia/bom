import { test, expect } from "@playwright/test";
import { signUpAndGo } from "./helpers";
import path from "node:path";

test("catalog import: dry-run, commit, dashboard reflects audit entry", async ({ page }) => {
  await signUpAndGo(page, "/catalog");
  await page.getByRole("link", { name: /Import/ }).click();
  await expect(page).toHaveURL(/\/catalog\/import$/);

  await page.locator('input[type="file"]').setInputFiles(path.resolve("tests/fixtures/catalog-import/good.xlsx"));

  await expect(page).toHaveURL(/\/catalog\/import\?id=/);
  await expect(page.getByText("Total rows")).toBeVisible();
  await expect(page.getByText("To add")).toBeVisible();
  await expect(page.locator("text=Will create")).toBeVisible();

  await page.getByRole("button", { name: /^Import$/ }).click();
  await expect(page).toHaveURL(/\/catalog$/);
  await expect(page.getByText("FX-NEW-1")).toBeVisible();

  await page.goto("/dashboard");
  await expect(page.getByText(/Imported \d+ items/)).toBeVisible();
});

test("catalog import: header mismatch shows diff", async ({ page }) => {
  await signUpAndGo(page, "/catalog/import");
  await page.locator('input[type="file"]').setInputFiles(path.resolve("tests/fixtures/catalog-import/header-mismatch.xlsx"));
  await expect(page.getByText(/Header row doesn't match/i)).toBeVisible();
});

test("catalog import: errors flagged in preview", async ({ page }) => {
  await signUpAndGo(page, "/catalog/import");
  await page.locator('input[type="file"]').setInputFiles(path.resolve("tests/fixtures/catalog-import/with-errors.xlsx"));
  await expect(page).toHaveURL(/\/catalog\/import\?id=/);
  await expect(page.getByText(/rows with errors/)).toBeVisible();
  await expect(page.getByText("missing_required")).toBeVisible();
  await expect(page.getByText("duplicate_in_file")).toBeVisible();
});
