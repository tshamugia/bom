import { execSync } from "node:child_process";
import { config } from "dotenv";

// Same env as the dev server: `.env.local` locally, the job's env in CI (already-set
// variables win over the file).
config({ path: ".env.local", quiet: true });

export default function globalSetup() {
  const run = (cmd: string, extra: Record<string, string> = {}) =>
    execSync(cmd, { stdio: "inherit", env: { ...process.env, ...extra } as NodeJS.ProcessEnv });

  run("npx tsx src/db/seed-items.ts", { SEED_MODE: "insert" });
  run("npx tsx tests/e2e/seed-e2e.ts");
}
