import { type Page } from "@playwright/test";

export async function signUpAndGo(page: Page, path: string) {
  const email = `e2e_${Date.now()}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("E2E");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/Password/).fill("password123");
  await page.getByRole("button", { name: /create account/i }).click();
  await page.waitForURL(/\/dashboard/);
  await page.goto(path);
}
