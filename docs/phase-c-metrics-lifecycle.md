# Phase C — Metrics & Lifecycle

_Source: `docs/plan.md` §2.4, §2.5, §3 steps 15–18 · Priority: **P1–P2** · Estimate: ~2 days_

## Context

The dashboard reports a hardcoded `avgLeadTimeDays = 5.8` (`src/server/queries/dashboard.ts:23`), making the headline metric a lie. The project lifecycle is also incomplete: no soft-delete, no way to clone a revision into a new draft, no owner / due-date columns on the project list (despite a deleted spec calling for them). Phase C closes these gaps so the app's data is honest and revisions can flow through real-world iteration.

## Goals

- Dashboard `avgLeadTimeDays` computed from real vendor lead times.
- Projects can be soft-deleted (`projects.deletedAt`) and excluded from default queries.
- Approved revisions can be cloned into a new draft revision in one click.
- Project list and dashboard surface owner + due date.

## Checklist

### 15. Dashboard avg lead time
- [x] `src/server/queries/dashboard.ts:23` — replace hardcoded value with computed avg of `vendors.leadTimeDays` (org-scoped)
- [x] Decide weighting: simple mean vs. weighted by line count (start with simple mean; document the choice)
- [x] Update unit test if one exists; add one if not

### 16. Soft-delete projects
- [x] `src/db/schema/projects.ts` — add `deletedAt timestamp` (nullable)
- [x] `npm run db:generate` → review migration → `npm run db:migrate`
- [x] `src/server/actions/projects.ts` — add `softDeleteProject(id)` and `restoreProject(id)`; both org-scoped + audited
- [x] Update list/detail queries to filter `deletedAt IS NULL` by default
- [x] Verify cascade behavior: revisions, exports, approvals continue to reference the project (no FK breakage)
- [x] **Never hard-delete** (suggestion §6.6) — even an admin "purge" stays as a soft-delete

### 17. Clone revision
- [x] `src/server/actions/revisions.ts` (or `bom-lines.ts`) — `cloneRevision(sourceRevisionId)`:
  - Verify source is in caller's org (`ensureRevisionInOrg` pattern)
  - Allocate next revision letter
  - Copy `bomSections` and `bomLines` into the new revision
  - Status starts as `draft`
  - Audit
  - _Existing `branchRevision` already implements this; reused via UI button_
- [x] Add Clone button on `/projects/[id]/history` (or wherever the revision list lives)
- [ ] E2E: clone → new draft appears; lines match source by content _(unit coverage in `revisions.test.ts`)_

### 18. Owner & due date
- [x] `src/db/schema/projects.ts` — add `ownerId uuid references users.id` and `dueAt timestamp` (both nullable) _(already present as `ownerId` + `targetDate`)_
- [x] Migration via `npm run db:generate`
- [x] `src/server/actions/projects.ts` — accept `ownerId`, `dueAt` on create/update
- [x] `src/app/(app)/projects/page.tsx` (list) — show Owner + Due columns
- [x] `src/app/(app)/dashboard/page.tsx` — surface upcoming-deadline tile
- [x] `src/app/(app)/projects/[id]/page.tsx` — owner picker (member dropdown) + due-date picker on edit form

## Files Touched

| Path | Change |
|---|---|
| `src/server/queries/dashboard.ts` | replace hardcoded metric |
| `src/db/schema/projects.ts` | `deletedAt`, `ownerId`, `dueAt` |
| `drizzle/<migration>.sql` | generated migration |
| `src/server/actions/projects.ts` | soft-delete, restore, owner/due fields |
| `src/server/actions/revisions.ts` (or new) | `cloneRevision` |
| `src/server/queries/projects.ts` | filter `deletedAt IS NULL` |
| `src/app/(app)/projects/page.tsx` | Owner + Due columns |
| `src/app/(app)/projects/[id]/page.tsx` | edit form fields |
| `src/app/(app)/projects/[id]/history/page.tsx` (or revisions list) | Clone button |
| `src/app/(app)/dashboard/page.tsx` | upcoming-deadlines surface |
| `tests/e2e/projects.spec.ts` | extend for soft-delete + clone |

## Verification

- [x] `npm run lint` clean _(no new errors introduced; pre-existing failures unchanged)_
- [x] `npm test` passes _(99/99)_
- [ ] `npm run test:e2e` passes
- [ ] Manual:
  - Dashboard avg lead time changes when a vendor's `leadTimeDays` changes
  - Soft-delete a project → disappears from `/projects` but row still exists in DB; audit log keeps the reference
  - Clone an approved revision → new draft appears with identical sections/lines; status `draft`
  - Create project with owner + due date → both visible in list and dashboard
- [x] Spot-check that no query forgot to filter `deletedAt IS NULL` (especially in builder, preview, approvals paths) _(`getProject`, `listProjects`, `globalSearch` filtered; preview/builder/approvals enter via `getProject`)_

## Notes / Decisions

- For `avgLeadTimeDays`, simple mean is fine to start; if vendors with rare items skew the metric, switch to weighted mean by line count later.
- `ownerId` is a foreign key to `users`, not `memberships`. This means a transferred or removed user could leave dangling owners — handle with `ON DELETE SET NULL` or a "reassign on disable" rule in Phase A's `disableUser` flow.
- Don't add a "force delete" admin escape hatch. Audit-log integrity beats convenience.
