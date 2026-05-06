# BOM Project — Implementation Plan

_Last updated: 2026-05-06 · Branch: `main` (HEAD `1da19a5`)_

This document tracks the gap between the current implementation on `main` and the intended product. It is the single source of truth for "what's left to build" — supersedes the deleted `docs/superpowers/plans/*` files.

---

## 1. Current State (Summary)

The core flows are implemented end-to-end on `main`:

- **Routing & shell:** authenticated `(app)` group with sidebar/topbar; auth group with sign-in/sign-up/verify.
- **Domain model:** organizations → memberships → users; projects → bomRevisions → bomSections → bomLines; items, vendors, categories; bomExports, approvals, auditLog.
- **Builder, Preview, Approvals, History, Catalog, Vendors, Dashboard** all render real DB data via server queries.
- **BOM versioning:** revision letter lifecycle (`draft → committed → in-progress → review → approved → locked`), `isRevisionImmutable` gate.
- **Bulk catalog import** (XLSX dry-run + commit), **S3 exports** with presigned download URLs, **3-stage approvals** (Engineering/Procurement/Finance), **audit logging** on every mutation.
- **Multi-tenancy** scoped on every server action via `getCurrentOrgId()` (`src/server/org.ts`).

---

## 2. Features Not Implemented / Gaps

Items below are ordered by priority. Each entry lists the file(s) where the gap lives so it can be picked up directly.

### 2.1 Auth — Registration Removal & Root User (P0)

The current auth model lets anyone sign up, and each new user auto-provisions a brand-new workspace. Per product direction, this must change:

- **Disable public registration.** `src/lib/auth.ts` enables `emailAndPassword` without `disableSignUp`, and `signUp.email(...)` is called from `src/app/(auth)/sign-up/page.tsx`. Both must be closed off (`disableSignUp: true` in better-auth, sign-up page deleted, nav links removed).
- **Seed a default root user.** A migration / seed script should create a single `root@<host>` (or env-configured) user with role `"owner"` in a single workspace. Credentials sourced from env (`ROOT_USER_EMAIL`, `ROOT_USER_PASSWORD`) and only created if no users exist.
- **Admin-managed user provisioning.** Add `/users` (admin-only) page where an `owner`/`admin` member can create users by email + temporary password. Reuse better-auth's admin API (`auth.api.signUpEmail` server-side) inside a server action gated by `requireRole("admin"|"owner")`.
- **Membership roles.** `src/db/schema/memberships.ts` already has `role text default 'member'`. Standardize on `owner | admin | member` (no schema change, just enforced enum in code).
- **Fix the auto-provision side effect.** `src/lib/auth.ts:21-41` and `src/server/org.ts:25-40` both create a *new* organization on first user — this is the wrong behavior under the root model. New users created by an admin must join the *existing* org. Replace the org-creation branch with: throw if no org exists (seed should have created it).

**Files:**
- `src/lib/auth.ts` (disable signup, remove org auto-create hook)
- `src/server/org.ts` (remove `provisionMembership` org-creation branch)
- `src/app/(auth)/sign-up/page.tsx` (delete)
- `src/app/(auth)/sign-in/page.tsx` (remove "Have no account?" link)
- `src/db/seed.ts` (add root user seed)
- `src/server/actions/users.ts` (new — create/list/disable users)
- `src/app/(app)/users/page.tsx` (new — admin user list & invite form)
- `src/components/shell/nav-config.ts` (add Users entry, gate by role)

### 2.2 Auth — Secure Cookie Hardening (P0)

Better-auth defaults are reasonable but the configuration is implicit. Make every guarantee explicit:

- **Explicit cookie attributes** in `src/lib/auth.ts`: `httpOnly: true`, `secure: process.env.NODE_ENV === "production"`, `sameSite: "lax"` (lax not strict, so magic-link emails still work cross-site), `path: "/"`, sensible `maxAge` (e.g. 7 days), `cookieName: "better-auth.session_token"` (already the default — pin it).
- **Migrate `src/middleware.ts` → `src/proxy.ts`.** CLAUDE.md mandates `proxy.ts`; the file does not exist yet. Move the protected-paths gate there and **upgrade the check from "cookie present" to "session valid"** by calling `auth.api.getSession({ headers })` so an expired/forged cookie cannot pass.
- **Logout button.** `signOut` is exported from `src/lib/auth-client.ts` but no UI calls it. Add it to the topbar/sidebar user menu.
- **Magic link email delivery.** `src/lib/auth.ts:15-18` still `console.log`s the link. Wire to a real provider (SES via existing AWS creds is the path of least resistance) or — given the new root-user model — drop magic link entirely and rely on email+password (recommended; see §6).
- **No tokens in client storage.** Verified clean today; add a lint rule (`no-restricted-globals: localStorage` in client components touching auth) to keep it that way.

**Files:**
- `src/lib/auth.ts`
- `src/middleware.ts` → `src/proxy.ts` (rename + upgrade)
- `src/components/shell/topbar.tsx` (logout)
- `src/lib/email.ts` (new — SES wrapper, optional if magic link kept)

### 2.3 Unwired UI Buttons (P1)

These are visible to users but do nothing on click — they leak product surface area without delivering function:

- **Catalog export button** (`src/app/(app)/catalog/page.tsx` ~line 25) — no handler. Add `/api/exports/catalog.xlsx` route + server action mirroring the BOM exporter in `src/lib/excel.ts`.
- **Vendor export button** (`src/app/(app)/vendors/page.tsx` ~line 18) — same fix, `/api/exports/vendors.xlsx`.
- **History filter button** (`src/app/(app)/history/page.tsx` ~line 14) — wire a popover with category + date-range filters; pass through as URL search params and apply in the existing query.
- **Topbar global search** (`src/components/shell/topbar.tsx` ~line 37) — currently a styled `<input>` with no behavior. Wire to `Cmd+K`-style command palette over projects/items/vendors via a single server action.

### 2.4 Calculated Metrics (P1)

- **Dashboard `avgLeadTimeDays`** is hardcoded `5.8` at `src/server/queries/dashboard.ts:23`. Compute from `vendors.leadTimeDays` (or per-line lead time once `vendor_price_lists` lands — see §2.6).

### 2.5 Project & Revision Lifecycle Holes (P2)

- **No project deletion.** `src/server/actions/projects.ts` only has create/update. Add a soft-delete (`projects.deletedAt`) with cascade behavior verified for revisions/exports/approvals — hard delete is risky given audit log references.
- **No revision duplication.** No way to "fork" an approved revision into a new draft for the next round. Add `cloneRevision(sourceRevisionId)` server action that copies sections + lines into a new revision letter.
- **No deadline / owner column on project list.** Spec existed in deleted `2026-05-03-bom-list-owner-rev-deadline-design.md`; not implemented. Add `projects.ownerId` (FK to users) and `projects.dueAt`, surface in `/projects` list and dashboard.

### 2.6 Bigger Backlog Features (P2–P3)

- **Vendor price lists** — multi-vendor pricing, MOQs, lead times, currency. Net-new schema (`vendor_price_lists`, `vendor_prices`). Required to compute real lead time and to drive procurement-side approvals.
- **Multi-level BOM (sub-assemblies)** — nesting `bom_lines` can reference another `bomRevisions.id`. Significant: affects rendering, exports, diffing.
- **Audit log UI** — data exists in `auditLog`; expose at `/audit` (admin-only) with filters by user/refType/date.
- **Approval enhancements** — deadlines + escalation, conditional routing by vendor/cost, bulk reassign.
- **Approval / lifecycle email notifications** — depends on §2.2 email setup.

### 2.7 Code & DX Hygiene (P3)

- `src/middleware.ts` violates `CLAUDE.md` ("do not use middleware.ts, instead use proxy.ts always") — fixed as part of §2.2.
- Catalog list is hardcoded to 80 rows on display; add pagination or virtualized list.
- `src/components/shell/sidebar.tsx` has a stub Settings entry — either implement settings (theme, cookie expiry, email config) or remove.
- Add Playwright coverage for the new admin-user-create flow and the auth changes.

---

## 3. Implementation Plan (Phased)

### Phase A — Auth Refactor (P0, ~1–2 days)

1. Add `disableSignUp: true` and explicit cookie config to `src/lib/auth.ts`. Remove the `databaseHooks.user.create.after` org-creation branch (replace with: assign membership to the single existing org; throw if none).
2. Update `src/server/org.ts::provisionMembership` to throw rather than create a new org.
3. Add `src/db/seed.ts` block: if no users, create the root org + root user from `ROOT_USER_EMAIL` / `ROOT_USER_PASSWORD` env vars (validated in `src/lib/env.ts`).
4. Delete `src/app/(auth)/sign-up/page.tsx`; remove links from sign-in page.
5. Rename `src/middleware.ts` → `src/proxy.ts`; replace cookie-presence check with `auth.api.getSession()` validation.
6. Add `signOut` button in `src/components/shell/topbar.tsx`.
7. Build `src/server/actions/users.ts` (`createUser`, `listUsers`, `disableUser`) gated by role check helper `requireRole(...)` in `src/server/org.ts`.
8. Build `/users` admin page (`src/app/(app)/users/page.tsx`) with create form + list. Add nav entry, gated by role.
9. Decide on magic link: either wire SES sender (`src/lib/email.ts`) or remove the plugin from `src/lib/auth.ts`.
10. Tests: unit (`requireRole`), e2e (`tests/e2e/auth.spec.ts` covering "non-admin cannot reach /users", "root creates user → user logs in").

### Phase B — Unwired UI Buttons (P1, ~1 day)

11. Catalog export route + handler.
12. Vendor export route + handler.
13. History filters (category + date-range).
14. Topbar command-palette search.

### Phase C — Metrics & Lifecycle (P1–P2, ~2 days)

15. Replace hardcoded `avgLeadTimeDays`.
16. Soft-delete projects.
17. Clone-revision action + button on `/projects/[id]/history`.
18. `projects.ownerId` + `projects.dueAt` (migration + UI surfaces).

### Phase D — Backlog (P2–P3, multi-week)

19. Vendor price lists schema + UI.
20. Audit log viewer.
21. Multi-level BOM (separate spec required first).
22. Approval enhancements (deadlines, escalation, bulk reassign).
23. Email notification pipeline.

---

## 4. Critical Files Reference

| Concern | Path |
|---|---|
| Auth config | `src/lib/auth.ts` |
| Auth client | `src/lib/auth-client.ts` |
| Org & session helpers | `src/server/org.ts` |
| Route gate (to be renamed) | `src/middleware.ts` → `src/proxy.ts` |
| Auth pages | `src/app/(auth)/{sign-in,sign-up,verify}/page.tsx` |
| Schema (membership roles) | `src/db/schema/memberships.ts` |
| Seed | `src/db/seed.ts` |
| Env validation | `src/lib/env.ts` |
| Dashboard query (hardcoded metric) | `src/server/queries/dashboard.ts` |
| Excel export utilities | `src/lib/excel.ts` |
| Nav | `src/components/shell/nav-config.ts` |
| Topbar (search + logout) | `src/components/shell/topbar.tsx` |

---

## 5. Verification

For each phase, before merging:

- `npm run lint` clean.
- `npm test` (Vitest) passes — note `fileParallelism: false`.
- `npm run test:e2e` (Playwright) passes; specifically the new auth spec.
- Manual: in a fresh DB, run `npm run db:migrate && npm run db:seed`, verify root user exists, sign-up route returns 404, log in as root, create a user via `/users`, log out, log in as that user, log back in as root and verify audit log entries exist.
- DevTools: confirm session cookie has `HttpOnly`, `Secure` (in prod build), `SameSite=Lax`, no auth tokens in `localStorage`/`sessionStorage`.

---

## 6. Suggestions (Author's Recommendations)

These are opinions for the user to weigh, not commitments:

1. **Drop magic link entirely.** With registration disabled and root-managed users, magic link adds attack surface (token in URL → leaks to history/referrer/email forwarding) for very little benefit over email+password. Recommend removing the plugin in Phase A rather than wiring SES.
2. **Use `sameSite: "lax"`, not `strict`.** Strict will break OAuth callbacks and email-link returns. Lax + httpOnly + secure is the correct default for an internal SaaS. CSRF risk is already low because mutations go through server actions (origin-checked).
3. **Add a `password_reset` flow before going live.** Root-managed users will forget passwords; without reset, root has to manually rotate them. A simple time-limited reset token sent over email is enough.
4. **Make CSRF guarantees explicit.** Even with sameSite=lax, audit every server action and API route handler to confirm origin/host validation; document the contract.
5. **Don't merge `feat/bom-versioning` blindly.** Per user direction, `main` is source of truth. The branch contains a pricing/stock removal that overlaps with §2.6 (vendor price lists). Cherry-pick only what's compatible; revisit after price lists land.
6. **Soft-delete projects, never hard-delete.** Audit log + approval history reference project IDs; hard delete creates dangling references and breaks legal/audit trails.
7. **Pick a single role vocabulary.** `owner`/`admin`/`member` is fine, but the schema currently only enforces `member` as default. Add a Drizzle `pgEnum` for `role` so future code (and migrations) are typed.
8. **Stop putting plan files under `docs/superpowers/`.** Those got deleted in the working tree because they were perceived as noise. A single living `docs/plan.md` (this file) plus PR descriptions is enough; spec-per-feature can live in PR bodies.
9. **Add a `requireRole` helper** alongside `requireSession` in `src/server/org.ts` so role checks have one canonical implementation rather than ad-hoc `m.role === "owner"` scattered through actions.
10. **Document the auth decision in `AGENTS.md`.** Future agents will be tempted to re-add a sign-up page because it's a Next.js convention. A one-paragraph note ("registration is intentionally disabled — see docs/plan.md §2.1") will save churn.
