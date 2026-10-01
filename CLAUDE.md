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
- `src/app/(auth)/*` — sign-in, `/forgot-password` and `/reset-password`. Public registration is intentionally disabled (`emailAndPassword.disableSignUp: true`); users are created from `/users` by an admin.
- `src/app/api/*` — route handlers (e.g. `api/auth/[...all]` for better-auth, `api/exports/[id]/download` rebuilds an export on the fly).
- `src/proxy.ts` (Next 16's renamed middleware) gates protected paths (`/dashboard`, `/builder`, `/preview`, `/catalog`, `/vendors`, `/approvals`, `/history`, `/users`, `/audit`, `/projects`, `/settings`, `/drawings`, `/reports`, `/help`) with a real `auth.api.getSession` check, not just cookie presence. It also sends viewers from `/builder/*` to the matching `/preview/*` page, from `/catalog`, `/vendors` and `/history` to `/dashboard`, and from `/projects/[id]/history|diff` to the project page.

### Single-tenant access control
The app ships as a single workspace; `organizations` and `memberships` do not exist. Authorization is driven by `user.role` — `admin | member | viewer` (`owner` was merged into `admin` in migration 0021; `viewer` added in 0022). `src/lib/roles.ts` has `roleOf()` / `isAdmin()` / `canEdit()` and `EDITOR_ROLES` (client-safe; use them instead of casting `session.user`). `src/server/auth-context.ts` exposes:
- `requireSession()` — throws `UNAUTHENTICATED` when no session, `USER_DISABLED` for soft-disabled users.
- `requireRole(...roles)` — wraps `requireSession()` and throws `FORBIDDEN` unless the caller's role is one of the given values. Use `requireRole("admin")` for admin-only flows (tests mock only `requireSession`/`requireRole`, so don't add other helpers there).

**Admin-only:** `/users` (create, role change, disable, password reset), `/audit`, all of Settings except Profile (procurement email, drawing email recipients, reminders, disciplines — including the per-project recipient lists), and deleting/archiving projects, BOMs, vendors and drawings. Members can create and edit everything else. `{ ok, error }`-style actions return `ADMIN_ONLY_ERROR`; throwing actions use `requireRole("admin")`. Hide the matching buttons for members too (pages pass `canDelete` / `readOnly`).

**Viewers are read-only and get a status-only app** (site managers, PMs checking progress, often on a phone). `/dashboard` renders `ViewerOverview` (`src/components/overview/`) instead of the working dashboard: revisions issued to them to confirm, drawing progress, what waits for approval, what was sent (drawing issues + BOMs to procurement, `src/server/queries/status-overview.ts`) and what's coming up. Their nav (`nav-config.ts`, `VIEWER_MOBILE_TABS`) is Overview, Projects, Drawings and Sent; the builder, preview index, history, catalog and vendors are hidden and redirected in `src/proxy.ts`. On drawing pages they don't see hours or BOM usage, project pages hide notification settings, and search covers projects and drawings only. They can download exports/reports and change their own password, but nothing else. Every mutating action must reject them — throwing actions use `requireRole(...EDITOR_ROLES)`, `{ ok, error }` actions return `READ_ONLY_ERROR` when `!canEdit(session.user)`. The only exception is `acknowledgeTransmittal` (a recipient confirming receipt). Pages compute `readOnly = !canEdit(session.user)` and hide write controls; links into the builder go to `/preview/...` for viewers. Viewers can't be a drawing owner or approving engineer (filter `listOwnerCandidates()` by `role`), but can be a project manager or a notification/transmittal recipient.

**Passwords:** everyone changes their own in Settings → Profile (`authClient.changePassword`). Admins who forget theirs use `/forgot-password` (better-auth `sendResetPassword` only emails admins; members are refused silently). Admins reset members with a temporary password (`resetUserPassword`), which revokes the member's sessions. Passwords an admin sets (new account or reset) are temporary: `user.mustChangePassword` is set and `src/proxy.ts` keeps the user on `/settings/profile` until they pick their own (cleared in the `/change-password` hook and `onPasswordReset`). New passwords need `PASSWORD_MIN_LENGTH` (12, `src/lib/password-policy.ts`). Sign-in is rate-limited per IP keyed on `X-Real-IP` (Railway's edge sets it; `X-Forwarded-For` is client-controlled — `clientInfo()` uses the same order) and locked per email after 10 failures in 15 minutes (`src/server/lib/sign-in-lockout.ts`, counted from `auth.signin.failed` audit rows). Disabled users can't start a session (`databaseHooks.session.create.before`).

**All server actions and queries must call `requireSession()` (or `requireRole(...)` for admin-only flows) before reading or mutating data.** Domain rows are global to the install; do NOT add an `organizationId` column or filter. The root user is seeded by `npm run db:seed` from `ROOT_USER_EMAIL` / `ROOT_USER_PASSWORD` env vars (defaults: `t.shamugia@insta.ge` / `Password123`).

### Data layer
- `src/db/client.ts` — single `postgres-js` pool, exported as `db`.
- `src/db/schema/*.ts` — one Drizzle schema file per table; `src/db/schema/index.ts` re-exports everything. Drizzle config is `strict: true` (see `drizzle.config.ts`) — schema changes require a generated migration.
- Domain model: `user` (with `role`); `projects` → `bomRevisions` → `bomSections` → `bomLines` (lines reference `items` which reference `vendors`/`categories`); `bomExports`, `approvals`, and `auditLog` track artifacts and history.
- Revisions have a status lifecycle; `src/server/lib/revision-status.ts` `isRevisionImmutable` gates writes on locked revisions — use it before any line/section mutation.
- BOM approvals (`src/server/actions/approvals.ts`, no UI yet — only `requestApproval` runs, via `sendBomToProcurement`): the requester can't approve, one person approves at most one stage, an assigned stage is only the assignee's, only the requester or an admin cancels and only while pending; stage moves are conditional updates in a transaction.
- Engineering drawings (`/drawings`, no files — metadata only): `drawing` (per project, code unique among non-deleted) → `drawing_revision` (`rev1`, `rev2`…; only the latest moves, older ones are locked) → `drawing_event` (created/updated/status/comment timeline). Status rules live in `src/lib/drawing-status.ts` `checkDrawingTransition`: statuses are free except that Awaiting approval and later require a second engineer (not the owner) to approve from Need to be approved. Whoever requests the approval can't name themselves as the reviewer, and `isOwnerChangeBlocked` stops the latest revision's reviewer/approver from becoming the owner — together they close "hand the drawing to someone else, approve it yourself". Status changes email the owner, approver and `drawing_notify_recipient` users (global rows have `project_id = null`) via `after()` in `src/server/lib/drawing-notify.ts`; drawing actions return `{ ok, error }` instead of throwing.
- BOM ↔ drawing references (`bom_revision_drawing`) store the drawing revision a BOM revision was built from. A reference is outdated only when a later drawing revision has `bom_impact = true` and is newer than both the built-from revision and `checked_revision_id` — use `isOutdatedSql` / `bomImpactRevisions` in `src/server/lib/bom-drawing-outdated.ts`, never a plain revision-number comparison. `confirmNoBomChange` ("No BOM change") records the check on the BOM's current revision even when it's committed — the one metadata write allowed on an immutable revision; lines and the built-from revision never change. Join `drawing_revision` more than once with `alias()` from `drizzle-orm/pg-core`, not `aliasedTable` (the row type collapses to `never`).

### Server actions vs. queries
- `src/server/actions/*` — `"use server"` mutations. Always: validate input with Zod → `requireSession()` (or `requireRole`) → mutate → `audit(...)` → `revalidatePath(...)`.
- `src/server/queries/*` — read-only data loaders called from server components.
- `src/server/audit.ts` writes to `auditLog` (with IP + user agent); call it after every mutation, including deletes. Auth events (sign-in, failed sign-in, password change/reset) are written from better-auth hooks in `src/lib/auth.ts` via `src/server/lib/audit-write.ts`, which must stay free of `server-only` because the seed scripts import `auth`. Security/admin kinds listed in `src/lib/audit-kinds.ts` `ADMIN_ONLY_KINDS` show only on `/audit` (admins); History → Activity shows the rest to everyone. New audit kinds need a label in `src/components/history/activity-table.tsx`.

### Client state
Zustand stores in `src/stores/` (`builder-store.ts`, `tweaks-store.ts`) hold ephemeral UI state only — filters, column visibility, etc. Persisted preferences use a versioned migration (see the `v2 migration` in recent commits). Don't put server data in stores; pass it down via server-component props or fetch via server actions.

### Integrations
- **better-auth** (`src/lib/auth.ts`): email/password only. Public sign-up is disabled; cookies are pinned to `httpOnly`, `sameSite=lax`, 7-day `maxAge`, and `secure` in production.
- **Excel exports are never stored.** BOM exports (`src/server/lib/run-export.ts`) record a `bom_export` metadata row and hand the bytes straight back; `api/exports/[id]/download` rebuilds the file from the revision + saved options (`renderExportFile`). Catalog/vendor/dashboard `.xlsx` routes stream too. Don't reintroduce S3 uploads for exports.
- **S3** (`src/lib/s3.ts`): only catalog-import staging uses it now. Env: `AWS_REGION`, `S3_BUCKET`, optional `AWS_S3_ENDPOINT` + `S3_FORCE_PATH_STYLE` for MinIO/local.
- **exceljs / papaparse** (`src/lib/excel.ts`): catalog import + BOM export.
- **Env validation** (`src/lib/env.ts`): Zod-validated at module load — adding a new env var means updating this schema.

### UI conventions
- shadcn/ui primitives live in `src/components/ui/`; feature components are grouped by surface (`builder/`, `preview/`, `approvals/`, `master/`, etc.).
- Tailwind v4 with CSS variables (e.g. `bg-[var(--color-bg)]`); design tokens are defined in `src/app/globals.css`.
- **Mobile first.** The layout layer at the end of `globals.css` is written phone-first: base rules are the phone layout, `min-width: 701px` adds tablet, `min-width: 961px` desktop (sidebar becomes a drawer + bottom tab bar below 961/701px). Every page must fit a 360px phone with no horizontal page scroll. For per-element tweaks use `max-[701px]:` (below 701px) / `min-[701px]:` utilities; phone-only CSS uses `max-width: 700.98px` so the boundary matches.
- Tables on phones: add `tbl-list` (compact rows — cell classes `l-title`, `l-aside`, `l-line`, `l-meta`, `l-end`, `l-hide`) or `tbl-cards` (label/value cards — `data-label` on each `<td>`, plus `td-main`, `td-full`, `td-end`, `td-hide`; `cards-4` for numeric tables). See `drawings-table.tsx` / `dashboard-parts.tsx`.
- `PageHead` actions (`.page-actions`) fill the row on phones; `.tabs-scroll` makes a tab row scroll sideways on phones; collapsible filters use `.filters-bar` / `.filters-toggle` / `.filters-panel` / `.chip-toggle` (see `drawing-filters.tsx`). shadcn `DialogContent` is a bottom sheet on phones with a sticky footer. Touch targets grow on coarse pointers globally.
- **Toasts:** import `toast` from `@/lib/toast`, never from `sonner` (ESLint blocks it). Success closes on its own; error, warning and info stay until the user closes them (close button top-right; the same text replaces an open toast instead of stacking). Green/yellow/red come from the `--toast-*` tokens in `globals.css`.
- **In-app help:** `/help` (`src/app/(app)/help/page.tsx`, content in `src/components/help/help-sections.tsx`, filtered by role) plus `<HelpTip topic="…">` (?) popovers whose short text lives in `src/lib/help-topics.ts`. Every topic id is also a section anchor on `/help` (`tests/unit/lib/help-topics.test.tsx` checks it). When a rule changes — statuses, roles, what locks what — update the tip and the section with it. Say why a control is disabled or read-only in a visible `<BlockedNote>` next to it, not a `title` tooltip (phones never show those).
- Turbopack dev keeps serving the old compiled `globals.css` after edits (even across restarts); delete `.next/dev` and restart `npm run dev` to see CSS changes.

## Tests
- Unit: `tests/unit/**/*.test.{ts,tsx}` and colocated `src/**/*.test.{ts,tsx}`. `tests/setup.ts` loads `@testing-library/jest-dom`. Vitest aliases `server-only` to `tests/test-helpers/server-only-shim.ts` so server modules can be imported in jsdom.
- **Server tests TRUNCATE every table** (`tests/test-helpers/db.ts` `resetDb`) in whatever `DATABASE_URL` points at, and Vitest loads `.env.local` (the dev DB). Run them against a throwaway DB instead — dotenv doesn't override an already-set variable: `docker exec bom-postgres psql -U bom -d bom -c "create database bom_test"` once, then `DATABASE_URL=postgres://bom:<pw>@localhost:5432/bom_test npx drizzle-kit migrate` and `DATABASE_URL=… npx vitest run`.
- E2E: `tests/e2e/*.spec.ts` against the real dev server (Playwright auto-launches `npm run dev`); helpers in `tests/e2e/helpers.ts`.

## Path aliases
`@/*` → `src/*` (see `tsconfig.json` and `vitest.config.ts`).
