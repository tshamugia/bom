import { type Page } from "@playwright/test";

const ROOT_EMAIL = process.env.ROOT_USER_EMAIL ?? "t.shamugia@insta.ge";
const ROOT_PASSWORD = process.env.ROOT_USER_PASSWORD ?? "Password123";

export async function signInAndGo(page: Page, path: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(ROOT_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(ROOT_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  // Editors land on /projects, viewers on /dashboard.
  await page.waitForURL(url => !url.pathname.startsWith("/sign-in"), { timeout: 30_000 });
  if (new URL(page.url()).pathname !== path) await page.goto(path);
}

// Backwards-compatible alias used by older specs.
export const signUpAndGo = signInAndGo;
