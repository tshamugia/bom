import { test, expect } from "@playwright/test";
import { ROOT_EMAIL, ROOT_PASSWORD, signInAndGo } from "./helpers";

test("unauthenticated visit to /dashboard redirects to sign-in", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("/sign-up returns 404", async ({ page }) => {
  const res = await page.goto("/sign-up");
  expect(res?.status()).toBe(404);
});

test("an admin signs in and lands on Projects", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(ROOT_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(ROOT_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  // "/" sends editors to /projects and viewers to /dashboard.
  await expect(page).toHaveURL(/\/projects$/, { timeout: 15_000 });
});

test("sign-out clears the session and bounces to /sign-in", async ({ page }) => {
  await signInAndGo(page, "/dashboard");
  await page.getByRole("button", { name: "Open account menu" }).click();
  await page.getByRole("menuitem", { name: /sign out/i }).click();
  await page.waitForURL(/\/sign-in/, { timeout: 10_000 });
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("/users is reachable as admin", async ({ page }) => {
  await signInAndGo(page, "/users");
  await expect(page.getByRole("heading", { name: /^users$/i })).toBeVisible();
});
