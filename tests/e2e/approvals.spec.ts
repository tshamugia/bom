import { test, expect } from "@playwright/test";
import { expectRevision, openBom } from "./helpers";
import { scenario } from "./e2e-data";

const { bom } = scenario("approval");

// NAMING §6: P01… until the client approves, then C01, and every later revision is C.
// (Sending to procurement needs SMTP and recipients, so this spec sets Approved by hand.)
test("the client's approval turns P01 into C01, and the next draft is C02", async ({ page }) => {
  test.setTimeout(90_000);
  await openBom(page, bom);

  await page.getByRole("button", { name: "Commit revision" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Commit P01" }).click();
  await expectRevision(page, "Committed", "P01");

  await page.getByRole("button", { name: "Change status" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Change status of P01" })).toBeVisible();
  await dialog.getByLabel("New status").selectOption("approved");
  await dialog.getByLabel("Comment").fill("Client confirmed by email (e2e)");
  await dialog.getByRole("button", { name: "Change status" }).click();
  await expectRevision(page, "Approved", "C01");

  await page.getByRole("button", { name: "New revision" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Create revision" }).click();
  await expectRevision(page, "Draft", "C02");
});
