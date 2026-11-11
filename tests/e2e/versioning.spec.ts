import { test, expect } from "@playwright/test";
import { expectRevision, openBom, projectHistoryLink } from "./helpers";
import { scenario } from "./e2e-data";

const { bom } = scenario("versioning");

// In order: the last test commits P01 and opens P02, which the earlier ones don't expect.
test.describe.configure({ mode: "serial" });

test("a draft shows its P label with commit and discard controls", async ({ page }) => {
  await openBom(page, bom);
  await expectRevision(page, "Draft", "P01");
  await expect(page.getByRole("button", { name: "Commit revision" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Discard draft" })).toBeVisible();
  await expect(projectHistoryLink(page)).toBeVisible();
});

test("the history page lists the project's revisions", async ({ page }) => {
  await openBom(page, bom);
  await projectHistoryLink(page).click();
  await expect(page).toHaveURL(/\/projects\/[^/]+\/history$/);
  await expect(page.getByRole("heading", { name: /history/i })).toBeVisible();
  await expect(page.locator("table tbody tr")).toHaveCount(1);
});

test("the commit dialog names the revision and runs its checks", async ({ page }) => {
  await openBom(page, bom);
  await page.getByRole("button", { name: "Commit revision" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Commit P01" })).toBeVisible();
  await expect(dialog.getByText(/no empty quantities/i)).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expectRevision(page, "Draft", "P01");
});

test("committing P01 and opening a new revision gives a P02 draft", async ({ page }) => {
  await openBom(page, bom);
  await page.getByRole("button", { name: "Commit revision" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Commit P01" }).click();
  await expectRevision(page, "Committed", "P01");

  await page.getByRole("button", { name: "New revision" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Create revision" }).click();
  await expectRevision(page, "Draft", "P02");
});
