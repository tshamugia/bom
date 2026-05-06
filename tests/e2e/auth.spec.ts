import { test, expect } from "@playwright/test";
import { signInAndGo } from "./helpers";

const ROOT_EMAIL = process.env.ROOT_USER_EMAIL ?? "t.shamugia@insta.ge";
const ROOT_PASSWORD = process.env.ROOT_USER_PASSWORD ?? "Password123";

test("unauthenticated visit to /dashboard redirects to sign-in", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("/sign-up returns 404", async ({ page }) => {
  const res = await page.goto("/sign-up");
  expect(res?.status()).toBe(404);
});

test("root user can sign in and reach the dashboard", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(ROOT_EMAIL);
  await page.getByLabel("Password").fill(ROOT_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 });
});

test("sign-out clears the session and bounces to /sign-in", async ({ page }) => {
  await signInAndGo(page, "/dashboard");
  await page.getByRole("button", { name: /user menu/i }).click();
  await page.getByRole("menuitem", { name: /sign out/i }).click();
  await page.waitForURL(/\/sign-in/, { timeout: 10_000 });
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/sign-in/);
});

test("/users is reachable as owner; non-admin users would be redirected away", async ({ page }) => {
  await signInAndGo(page, "/users");
  await expect(page.getByRole("heading", { name: /^users$/i })).toBeVisible();
});
