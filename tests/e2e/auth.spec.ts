import { test, expect } from "@playwright/test";

test("unauthenticated visit to /dashboard redirects to sign-in", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("user can sign up and lands on dashboard", async ({ page }) => {
  const email = `user_${Date.now()}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("Test User");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/Password/).fill("password123");
  await page.getByRole("button", { name: /create account/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});
