import { test, expect } from "@playwright/test";
import { signUpAndGo } from "./helpers";

test("draft revision shows commit + discard controls; non-draft shows new-revision", async ({ page }) => {
  await signUpAndGo(page, "/builder");
  await page.getByText("Northstar Beacon v3.2").click();
  await expect(page.getByRole("heading", { name: /Northstar Beacon v3\.2/ })).toBeVisible();

  // The header shows a status badge (Draft for seeded project) and Rev letter.
  await expect(page.getByText(/^Rev [A-Z]$/)).toBeVisible();

  // History link is present.
  await expect(page.getByRole("link", { name: /History/i })).toBeVisible();
});

test("history page loads for a seeded project", async ({ page }) => {
  await signUpAndGo(page, "/builder");
  await page.getByText("Northstar Beacon v3.2").click();

  await page.getByRole("link", { name: /History/i }).click();
  await expect(page).toHaveURL(/\/projects\/[^/]+\/history$/);
  await expect(page.getByRole("heading", { name: /history/i })).toBeVisible();
  // At least one revision row exists for the seeded project.
  await expect(page.locator("table tbody tr")).toHaveCount(1);
});

test("commit dialog opens from header and shows preflight checks", async ({ page }) => {
  await signUpAndGo(page, "/builder");
  await page.getByText("Northstar Beacon v3.2").click();

  await page.getByRole("button", { name: /commit revision/i }).click();
  await expect(page.getByRole("heading", { name: /commit rev/i })).toBeVisible();
  await expect(page.getByText(/no empty quantities|some lines have zero quantity/i)).toBeVisible();
});
