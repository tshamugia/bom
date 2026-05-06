# Phase A — Auth Refactor (Single-Tenant)

_Source: `docs/plan.md` §2.1, §2.2, §3 steps 1–10 · Priority: **P0** · Estimate: 2–3 days_

## Context

Today the app is wired for multi-tenant SaaS but is being shipped as a **single-installation, single-organization** product. Every domain table (`projects`, `items`, `vendors`, `categories`, `audit_log`) carries an `organization_id`, every server action filters by `getCurrentOrgId()`, and `databaseHooks.user.create.after` in `src/lib/auth.ts` auto-spawns a new org per signup (`src/server/org.ts::provisionMembership`). All of this is dead weight: there will only ever be one workspace, and users are created exclusively by an admin/owner.

This phase **removes the multi-tenant plumbing entirely**, disables public registration, hardens session cookies, replaces the `middleware.ts` cookie-presence gate with a real session check in `proxy.ts` (per `CLAUDE.md`), and adds the missing logout UI plus admin user management. After Phase A: `organizations` and `memberships` no longer exist, `user.role` is the sole authorization signal, only seeded root + admin-created users can sign in, and every protected request is validated server-side.

## Goals

- `organizations` and `memberships` tables dropped; `organization_id` columns removed from every domain table.
- `user.role` (`owner | admin | member`) is the single source of truth for authorization.
- Public sign-up route gone; `/sign-up` returns 404.
- A root user is created from env vars on first `db:seed` if no users exist.
- Session cookies have explicit `httpOnly` / `secure` / `sameSite=lax` / `maxAge` config.
- Route gate lives in `src/proxy.ts` and validates the session, not just cookie presence.
- Topbar has a working Sign Out.
- `/users` admin page lets owner/admin create users.
- Magic-link plugin either dropped or wired to a real email sender.

## Checklist

### 1. Schema: drop multi-tenancy
- [x] `src/db/schema/auth.ts` — add `role: userRoleEnum("role").notNull().default("member")` to `user`
- [x] `src/db/schema/enums.ts` — add `userRoleEnum` (`owner | admin | member`)
- [x] Delete `src/db/schema/organizations.ts` and `src/db/schema/memberships.ts`
- [x] `src/db/schema/index.ts` — drop the re-exports
- [x] Strip `organizationId` column + index from: `projects.ts`, `items.ts`, `vendors.ts`, `categories.ts`, `audit-log.ts`
- [x] `npm run db:generate` to produce a migration that:
  1. Adds `user.role` (default `member`)
  2. Drops FKs/indexes referencing `organization_id`
  3. Drops `organization_id` columns
  4. Drops `membership` and `organization` tables
- [x] Verify migration is reversible enough for dev resets (we accept data loss; this is pre-launch)

### 2. Replace `getCurrentOrgId` with role-based access
- [x] `src/server/org.ts` — rename file to `src/server/auth-context.ts`; keep `requireSession()`; **delete** `getCurrentOrgId` and `provisionMembership`
- [x] Add `requireRole(...roles: UserRole[])` that wraps `requireSession()` and checks `session.user.role`
- [x] Sweep every caller of `getCurrentOrgId()` across `src/server/{actions,queries,lib}` (~20 files) and:
  - Drop the `organizationId` argument / column from inserts
  - Drop the `eq(table.organizationId, orgId)` predicates from queries
  - Replace `ensureRevisionInOrg`-style guards with `requireSession()` (membership check is no longer meaningful)
- [x] Update Zod input schemas that accepted/required `organizationId`

### 3. Disable public registration
- [x] `src/lib/auth.ts` — set `emailAndPassword.disableSignUp: true`
- [x] Delete `src/app/(auth)/sign-up/page.tsx`
- [x] `src/app/(auth)/sign-in/page.tsx` — remove "Have no account?" link
- [x] `src/components/shell/nav-config.ts` — confirm no sign-up entry

### 4. Auth hooks cleanup
- [x] `src/lib/auth.ts` — delete the `databaseHooks.user.create.after` org-provision block entirely; new users only ever exist via the admin-create flow (step 8) which sets `role` explicitly
- [x] Confirm no other better-auth hook still references `organizations` / `memberships`

### 5. Root user seed
- [x] `src/lib/env.ts` — add `ROOT_USER_EMAIL`, `ROOT_USER_PASSWORD` to Zod schema (required outside `NODE_ENV=test`)
- [x] `src/db/seed.ts` — if `users` table is empty, create a single root user (`role: "owner"`) from env vars via `auth.api.signUpEmail` with `disableSignUp` bypassed server-side; idempotent on re-run

### 6. Cookie hardening
- [x] `src/lib/auth.ts` — add explicit `cookies` config:
  - `httpOnly: true`
  - `secure: process.env.NODE_ENV === "production"`
  - `sameSite: "lax"`
  - `path: "/"`
  - `maxAge: 60 * 60 * 24 * 7` (7 days)
  - Pin `cookieName: "better-auth.session_token"`

### 7. Migrate `middleware.ts` → `proxy.ts`
- [x] Create `src/proxy.ts`; delete `src/middleware.ts`
- [x] Replace cookie-presence check with `auth.api.getSession({ headers })` validation
- [x] Preserve protected paths: `/dashboard`, `/builder`, `/preview`, `/catalog`, `/vendors`, `/approvals`, `/history`, `/users`

### 8. Logout UI
- [x] `src/components/shell/topbar.tsx` — add user menu with Sign Out wired to `signOut()` from `src/lib/auth-client.ts`

### 9. Admin user management
- [x] `src/server/actions/users.ts` (new) — `createUser(email, password, role)`, `listUsers`, `disableUser`; gated by `requireRole("owner", "admin")`; uses `auth.api.signUpEmail` server-side and sets `role` post-create
- [x] `src/app/(app)/users/page.tsx` (new) — user list + create form (email, temp password, role select); owners can create admins, admins can only create members
- [x] `src/components/shell/nav-config.ts` — add `Users` entry, role-gated to `owner` / `admin`
- [x] Server-component layouts that branch on role should read `session.user.role` directly — no membership lookup

### 10. Magic-link decision
- [x] **Decision:** drop the magic-link plugin (recommended, suggestion §6.1) OR wire SES via new `src/lib/email.ts`
- [x] Apply chosen path in `src/lib/auth.ts`

### 11. Tests
- [ ] Unit: `requireRole` helper (allow / deny matrix across the three roles + unauthenticated)
- [ ] Unit: smoke test that a representative server action (e.g. `createProject`) no longer accepts/uses `organizationId`
- [x] E2E: `tests/e2e/auth.spec.ts` covering:
  - non-admin user redirected away from `/users`
  - root user creates a new user → that user signs in successfully
  - `/sign-up` returns 404
  - sign-out clears session and bounces to `/sign-in`

### 12. Docs
- [x] `CLAUDE.md` — update the **Multi-tenancy** section: replace with a **Single-tenant** note explaining that all domain rows are global to the install, and access is gated by `user.role`. Update the canonical-pattern reference.
- [x] `AGENTS.md` — one paragraph: "registration is intentionally disabled and the app is single-tenant — see docs/plan.md §2.1"

## Files Touched

| Path | Change |
|---|---|
| `src/db/schema/auth.ts` | add `role` column |
| `src/db/schema/enums.ts` | add `userRoleEnum` |
| `src/db/schema/organizations.ts` | **delete** |
| `src/db/schema/memberships.ts` | **delete** |
| `src/db/schema/index.ts` | drop org/membership re-exports |
| `src/db/schema/{projects,items,vendors,categories,audit-log}.ts` | drop `organizationId` column + index |
| `src/db/migrations/<new>` | generated migration: add role, drop org tables/cols |
| `src/server/org.ts` → `src/server/auth-context.ts` | rename; drop `getCurrentOrgId`/`provisionMembership`; add `requireRole` |
| `src/server/actions/*.ts` (8 files) | drop org filtering / org-id args |
| `src/server/queries/*.ts` (6 files) | drop org filtering |
| `src/server/lib/import-validator-context.ts` | drop org filtering |
| `src/server/audit.ts` | drop `organizationId` from audit rows |
| `src/lib/auth.ts` | disable signup; explicit cookies; remove org-create hook |
| `src/lib/env.ts` | add `ROOT_USER_EMAIL`, `ROOT_USER_PASSWORD` |
| `src/db/seed.ts` | seed root user only (no org) |
| `src/middleware.ts` → `src/proxy.ts` | rename + session validation |
| `src/app/(auth)/sign-up/page.tsx` | **delete** |
| `src/app/(auth)/sign-in/page.tsx` | remove sign-up link |
| `src/components/shell/topbar.tsx` | add Sign Out |
| `src/components/shell/nav-config.ts` | add Users entry (role-gated) |
| `src/server/actions/users.ts` | **new** — create/list/disable users |
| `src/app/(app)/users/page.tsx` | **new** — admin user UI |
| `src/lib/email.ts` | **new** if SES path chosen; else N/A |
| `tests/e2e/auth.spec.ts` | **new** |
| `CLAUDE.md`, `AGENTS.md` | single-tenant notes |

## Verification

- [ ] `npm run lint` clean
- [ ] `npm test` passes (`fileParallelism: false` reminder)
- [ ] `npm run test:e2e` passes; new auth spec green
- [x] `grep -r "organizationId\|getCurrentOrgId\|memberships\|organizations" src/` returns **no app-code hits** (only the deleted-migration history)
- [ ] Fresh DB walk-through:
  1. `npm run db:migrate && npm run db:seed`
  2. Root user exists; `organization` and `membership` tables are gone
  3. `/sign-up` returns 404
  4. Sign in as root → create a user via `/users`
  5. Sign out, sign in as new user; verify limited nav (no `/users`)
  6. Audit log records both events without an org column
- [ ] DevTools (prod build): session cookie has `HttpOnly`, `Secure`, `SameSite=Lax`; nothing in `localStorage`/`sessionStorage`

## Notes / Decisions

- **Why drop the org tables instead of keeping a single row?** A single-row `organizations` table is pure overhead: every query carries a redundant join, every action carries a redundant predicate, and future readers will assume multi-tenancy still applies. Removing it now (pre-launch, no production data) is cheaper than removing it later.
- **Drop magic link** (suggestion §6.1) — token-in-URL leaks via referrer/email forwarding; root-managed users don't benefit.
- **`sameSite: "lax"`** not `strict` (suggestion §6.2) — strict breaks email-link returns; CSRF risk already mitigated by server-action origin checks.
- **Add password reset** before going live (suggestion §6.3) — root will need to rotate forgotten passwords; defer to a follow-up if scope balloons.
- **Soft-delete philosophy** (suggestion §6.6) applies later (Phase C); call out here so reviewers don't add hard-delete to user management.
- **Migration is destructive** — dropping `organization_id` columns is irreversible without backup. Acceptable because the app is pre-launch; if any environment has real data, snapshot first.
