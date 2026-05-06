@AGENTS.md

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

do not use middleware.ts, instead use proxy.ts always!

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · shadcn/ui ·
Drizzle ORM · Postgres · better-auth · AWS S3 · Zustand · exceljs · Vitest · Playwright.

`AGENTS.md` warns that the Next.js version here has breaking changes vs. what you may know — when in doubt, read the relevant guide under `node_modules/next/dist/docs/` before writing or modifying server/client component, route handler, or `revalidatePath`/cache code.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Next.js dev server on http://localhost:3000 |
| `npm run build` | Production build |
| `npm run lint` | ESLint (`eslint-config-next`) |
| `npm test` | Run full Vitest suite once |
| `npm run test:watch` | Vitest in watch mode |
| `npx vitest run path/to/file.test.ts` | Run a single unit test file |
| `npm run test:e2e` | Playwright suite (auto-starts `npm run dev`) |
| `npx playwright test tests/e2e/builder.spec.ts` | Single e2e file |
| `npx playwright test -g "renders table"` | Single test by name |
| `npm run db:generate` | Generate a migration from schema diff |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:studio` | Drizzle Studio |
| `npm run db:seed` | Seed dev data (uses `.env.local`) |
| `docker compose up -d db` | Local Postgres for dev |

Vitest sets `fileParallelism: false` (see `vitest.config.ts`) — tests rely on shared DB/module state and must not be parallelised.

## Architecture

### Routing & access control
- `src/app/(app)/*` — authenticated app shell (sidebar + topbar in `(app)/layout.tsx`); the layout calls `auth.api.getSession` and redirects to `/sign-in` if missing.
- `src/app/(auth)/*` — sign-in only. Public registration is intentionally disabled (`emailAndPassword.disableSignUp: true`); users are created from `/users` by an owner/admin.
- `src/app/api/*` — route handlers (e.g. `api/auth/[...all]` for better-auth, `api/exports/[id]` for signed-URL S3 downloads).
- `src/proxy.ts` (Next 16's renamed middleware) gates protected paths (`/dashboard`, `/builder`, `/preview`, `/catalog`, `/vendors`, `/approvals`, `/history`, `/users`, `/projects`) with a real `auth.api.getSession` check, not just cookie presence.

### Single-tenant access control
The app ships as a single workspace; `organizations` and `memberships` do not exist. Authorization is driven by `user.role` (`owner | admin | member`). `src/server/auth-context.ts` exposes:
- `requireSession()` — throws `UNAUTHENTICATED` when no session, `USER_DISABLED` for soft-disabled users.
- `requireRole(...roles)` — wraps `requireSession()` and throws `FORBIDDEN` unless the caller's role is one of the given values.

**All server actions and queries must call `requireSession()` (or `requireRole(...)` for admin-only flows) before reading or mutating data.** Domain rows are global to the install; do NOT add an `organizationId` column or filter. The root user is seeded by `npm run db:seed` from `ROOT_USER_EMAIL` / `ROOT_USER_PASSWORD` env vars (defaults: `t.shamugia@insta.ge` / `Password123`).

### Data layer
- `src/db/client.ts` — single `postgres-js` pool, exported as `db`.
- `src/db/schema/*.ts` — one Drizzle schema file per table; `src/db/schema/index.ts` re-exports everything. Drizzle config is `strict: true` (see `drizzle.config.ts`) — schema changes require a generated migration.
- Domain model: `user` (with `role`); `projects` → `bomRevisions` → `bomSections` → `bomLines` (lines reference `items` which reference `vendors`/`categories`); `bomExports`, `approvals`, and `auditLog` track artifacts and history.
- Revisions have a status lifecycle; `src/server/lib/revision-status.ts` `isRevisionImmutable` gates writes on locked revisions — use it before any line/section mutation.

### Server actions vs. queries
- `src/server/actions/*` — `"use server"` mutations. Always: validate input with Zod → `requireSession()` (or `requireRole`) → mutate → `audit(...)` → `revalidatePath(...)`.
- `src/server/queries/*` — read-only data loaders called from server components.
- `src/server/audit.ts` writes to `auditLog`; call it after every mutation.

### Client state
Zustand stores in `src/stores/` (`builder-store.ts`, `tweaks-store.ts`) hold ephemeral UI state only — filters, column visibility, etc. Persisted preferences use a versioned migration (see the `v2 migration` in recent commits). Don't put server data in stores; pass it down via server-component props or fetch via server actions.

### Integrations
- **better-auth** (`src/lib/auth.ts`): email/password only. Public sign-up is disabled; cookies are pinned to `httpOnly`, `sameSite=lax`, 7-day `maxAge`, and `secure` in production.
- **S3** (`src/lib/s3.ts`): exports are uploaded and served via presigned URLs from `api/exports/[id]`. Env: `AWS_REGION`, `S3_BUCKET`, optional `AWS_S3_ENDPOINT` + `S3_FORCE_PATH_STYLE` for MinIO/local.
- **exceljs / papaparse** (`src/lib/excel.ts`): catalog import + BOM export.
- **Env validation** (`src/lib/env.ts`): Zod-validated at module load — adding a new env var means updating this schema.

### UI conventions
- shadcn/ui primitives live in `src/components/ui/`; feature components are grouped by surface (`builder/`, `preview/`, `approvals/`, `master/`, etc.).
- Tailwind v4 with CSS variables (e.g. `bg-[var(--color-bg)]`); design tokens are defined in `src/app/globals.css`.

## Tests
- Unit: `tests/unit/**/*.test.{ts,tsx}` and colocated `src/**/*.test.{ts,tsx}`. `tests/setup.ts` loads `@testing-library/jest-dom`. Vitest aliases `server-only` to `tests/test-helpers/server-only-shim.ts` so server modules can be imported in jsdom.
- E2E: `tests/e2e/*.spec.ts` against the real dev server (Playwright auto-launches `npm run dev`); helpers in `tests/e2e/helpers.ts`.

## Path aliases
`@/*` → `src/*` (see `tsconfig.json` and `vitest.config.ts`).
