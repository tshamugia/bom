import { defineConfig, devices } from "@playwright/test";

// Locally the suite runs against `npm run dev` (reusing one that is already up) and the
// database in `.env.local`; tests/e2e/seed-e2e.ts only touches projects named "E2E …".
// CI builds once and runs the production server, which is faster and closer to what ships.
const CI = !!process.env.CI;

export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 30_000,
  // The specs share one database.
  workers: 1,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // `next start` warns that it doesn't fit `output: "standalone"`, but it serves the
    // build fine; the Docker image runs .next/standalone/server.js instead.
    command: CI ? "npm run build && npm run start" : "npm run dev",
    url: "http://localhost:3000/api/health",
    reuseExistingServer: !CI,
    timeout: CI ? 300_000 : 120_000,
  },
});
