import { expect, type Page } from "@playwright/test";

export const ROOT_EMAIL = process.env.ROOT_USER_EMAIL ?? "t.shamugia@insta.ge";
export const ROOT_PASSWORD = process.env.ROOT_USER_PASSWORD ?? "Password123";

/** Signs in as the root admin (seed-e2e.ts makes sure it exists) and opens `path`. */
export async function signInAndGo(page: Page, path: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(ROOT_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(ROOT_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  // Editors land on /projects, viewers on /dashboard.
  await page.waitForURL(url => !url.pathname.startsWith("/sign-in") && url.pathname !== "/", { timeout: 30_000 });
  if (new URL(page.url()).pathname !== path) await page.goto(path);
}

/** Opens a BOM in the builder from the /builder list. */
export async function openBom(page: Page, bomName: string) {
  await signInAndGo(page, "/builder");
  await page.getByRole("link", { name: bomName, exact: true }).click();
  await page.waitForURL(/\/builder\/[^/]+\/[^/]+$/);
  await expect(page.getByRole("button", { name: "Switch BOM" })).toContainText(bomName);
}

/** Checks the builder header's status tag and revision label, e.g. Draft + P01. */
export async function expectRevision(page: Page, status: string, label: string) {
  // The tags sit next to the "Switch BOM" button, in the same row.
  const header = page.getByRole("button", { name: "Switch BOM" }).locator("xpath=..");
  await expect(header).toContainText(new RegExp(`${status}\\s*${label}\\b`));
}

/** The BOM's project history link in the builder header (the sidebar has its own "History"). */
export function projectHistoryLink(page: Page) {
  return page.locator('a[href^="/projects/"][href$="/history"]');
}
