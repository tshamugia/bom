import { test, expect, type Page } from "@playwright/test";
import { signInAndGo } from "./helpers";
import { E2E_DRAWINGS } from "./e2e-data";

// Issue #17: one remark and one time entry for several drawings ticked on /drawings.
// seed-e2e.ts recreates the drawings (and so drops what this spec wrote) before every run.

const [L1, L2, L3] = E2E_DRAWINGS.drawings.map(d => d.code);
const LOBBY = E2E_DRAWINGS.other.code;

const tick = (page: Page, code: string) => page.getByRole("checkbox", { name: `Select ${code}`, exact: true }).check();
const bar = (page: Page) => page.getByRole("region", { name: "Change the selected drawings" });

async function openDrawing(page: Page, code: string) {
  await page.goto("/drawings?q=E2E%20Shared");
  await page.getByRole("link", { name: code, exact: true }).click();
  await page.waitForURL(/\/drawings\/[^/?#]+$/);
}

test("shared time is logged once for drawings of one project and counted once in the total", async ({ page }) => {
  await signInAndGo(page, "/drawings?q=E2E%20Shared");

  // Across two projects it is refused, with the reason in the dialog.
  await tick(page, L1);
  await tick(page, LOBBY);
  await bar(page).getByRole("button", { name: "Shared time" }).click();
  let dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/select drawings of one project only/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Log shared time" })).toBeDisabled();
  await dialog.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("checkbox", { name: `Select ${LOBBY}`, exact: true }).uncheck();
  await tick(page, L2);
  await tick(page, L3);
  await bar(page).getByRole("button", { name: "Shared time" }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByText("For 3 drawings", { exact: true })).toBeVisible();
  await dialog.getByLabel("Hours").fill("5");
  await dialog.getByLabel("Note (optional)").fill("Coordination meeting");
  await dialog.getByRole("button", { name: "Log 5 h once" }).click();
  await expect(page.getByText("5 h logged once for 3 drawings")).toBeVisible();
  // The register hints it next to each drawing's own hours.
  await expect(page.getByText("+5 shared")).toHaveCount(3);

  // The drawing shows it apart from Logged, with the other drawings.
  await openDrawing(page, L1);
  const time = page.locator(".card", { has: page.getByRole("heading", { name: "Time", exact: true }) });
  await expect(time).toContainText("Logged 0 h");
  await expect(time).toContainText("Shared 5 h");
  await expect(time.getByRole("link", { name: L2, exact: true })).toBeVisible();
  await expect(time.getByRole("link", { name: L3, exact: true })).toBeVisible();

  // The project's dashboard counts 5 h, not 15.
  const projectHref = await page.getByRole("link", { name: new RegExp(`^${E2E_DRAWINGS.projectCode} — `) }).getAttribute("href");
  const projectId = projectHref!.split("/").pop();
  await page.goto(`/dashboard?project=${projectId}`);
  const hours = page.locator(".stat", { hasText: "Hours logged" });
  // The value, then "of 12 est." (three drawings of 4 h): 5 h, not 15.
  await expect(hours.locator(".stat-value")).toContainText(/^5\s*of 12 est\./);
  await expect(hours).toContainText("incl. 5 shared");

  // Removing it takes it off every drawing at once.
  await openDrawing(page, L2);
  await page.getByRole("button", { name: "Remove shared entry" }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(L1);
  await expect(dialog).toContainText(L3);
  await dialog.getByRole("button", { name: "Remove from all" }).click();
  await expect(page.getByText("5 h of shared time removed from 3 drawings")).toBeVisible();
  await page.goto("/drawings?q=E2E%20Shared");
  await expect(page.getByText("+5 shared")).toHaveCount(0);
});

test("a shared remark goes on every ticked drawing, across projects, and each closes it on its own", async ({ page }) => {
  await signInAndGo(page, "/drawings?q=E2E%20Shared");
  await tick(page, L1);
  await tick(page, L2);
  await tick(page, LOBBY);
  await bar(page).getByRole("button", { name: "Shared remark" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Raised by").selectOption({ label: "Site" });
  await dialog.getByLabel("Remark", { exact: true }).fill("Use the new cable tray legend");
  await dialog.getByRole("button", { name: "Add to 3 drawings" }).click();
  await expect(page.getByText("Remark added to 3 drawings")).toBeVisible();
  // Each drawing counts its own open remark.
  await expect(page.getByText("1 open remark")).toHaveCount(3);

  await openDrawing(page, L1);
  const remarks = page.locator("#remarks");
  await expect(remarks.getByText("Shared · 3 drawings")).toBeVisible();
  await expect(remarks).toContainText("Also on 2 other drawings · 2 open");
  await remarks.getByRole("button", { name: "Resolve" }).click();
  await remarks.getByRole("button", { name: "Mark resolved" }).click();
  await expect(page.getByText("Remark resolved")).toBeVisible();

  // Closing it on one drawing leaves it open on the others.
  await openDrawing(page, L2);
  await expect(remarks.getByRole("button", { name: "Resolve" })).toBeVisible();
  await expect(remarks).toContainText("Also on 2 other drawings · 1 open");
});
