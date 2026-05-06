# Phase D — Backlog

_Source: `docs/plan.md` §2.6, §2.7, §3 steps 19–23 · Priority: **P2–P3** · Estimate: multi-week_

## Context

Phase D is the long tail: features that need their own design rounds, larger schema work, and integrations. They are tracked here so they don't get lost, but should not be started until Phases A–C land. Each item below is "spec → schema → impl → test" — expect a per-feature design doc in the PR body before the schema lands.

## Goals

- Vendor price lists (multi-vendor pricing, MOQs, lead times, currency).
- Multi-level BOM (sub-assemblies / nested revisions).
- Audit-log viewer at `/audit` (admin-only) with filters.
- Approval enhancements (deadlines, escalation, conditional routing, bulk reassign).
- Email notification pipeline.
- DX hygiene cleanups left over from earlier phases.

## Checklist

### 19. Vendor price lists
- [ ] **Spec** in PR body: schema, currency model, MOQ rules, validity windows
- [ ] `src/db/schema/vendor-price-lists.ts` (new) — `vendor_price_lists` table
- [ ] `src/db/schema/vendor-prices.ts` (new) — `vendor_prices` rows: itemId, vendorId, price, currency, MOQ, leadTimeDays, validFrom, validTo
- [ ] Migration via `npm run db:generate`
- [ ] Server actions: `createPriceList`, `importPrices` (XLSX), `setActivePrice`
- [ ] UI: vendor detail page price-list editor + import flow
- [ ] Wire dashboard / lead-time computation through price lists (replaces simpler vendor-based avg from Phase C)
- [ ] Tests: unit (price selection logic) + e2e (import → preview → commit)

### 20. Multi-level BOM (sub-assemblies)
- [ ] **Separate spec required first** — design doc covering rendering, exports, diffing, cycle prevention
- [ ] Schema: `bomLines.subAssemblyRevisionId` FK → `bomRevisions.id` (nullable)
- [ ] Builder UI: indent / expand sub-assembly rows; cycle detection
- [ ] Preview UI: flatten or hierarchical view (toggle)
- [ ] Excel export: indent levels or separate sheets per assembly
- [ ] Diff: handle nested changes
- [ ] Approvals: decide whether sub-revisions inherit parent approval state or approve independently

### 21. Audit-log viewer
- [ ] `src/app/(app)/audit/page.tsx` (new) — admin-only, gated by `requireRole("owner", "admin")`
- [ ] Filters: user, refType, date range, action; URL search-param state
- [ ] Pagination (cursor-based; audit log can grow large)
- [ ] `src/components/shell/nav-config.ts` — add Audit entry, role-gated

### 22. Approval enhancements
- [ ] Deadlines per approval stage (`approvals.dueAt`) + overdue indicator on approvals page
- [ ] Escalation: auto-reassign or notify after deadline
- [ ] Conditional routing by vendor or cost threshold (rule engine in `src/server/lib/approval-routing.ts`)
- [ ] Bulk reassign UI (select N approvals → reassign to user X)

### 23. Email notification pipeline
- [ ] **Depends on Phase A magic-link decision** — if SES already wired, extend; otherwise build now
- [ ] `src/lib/email.ts` — generic sender (SES) with template support
- [ ] Triggers: approval requested, approval overdue, revision committed, user invited
- [ ] Per-user notification preferences (`users.emailPrefs` JSON column)
- [ ] Tests: unit (template rendering) + integration (mocked SES client)

### Code & DX hygiene (from §2.7)
- [ ] Catalog list — replace hardcoded 80-row cap with pagination or virtualization
- [ ] `src/components/shell/sidebar.tsx` — Settings stub: implement (theme, cookie expiry, email config) **or** remove the entry
- [ ] Playwright coverage for admin-user-create flow already added in Phase A — extend with edit/disable cases here
- [ ] Verify `src/middleware.ts` is gone (Phase A) — fail CI if reintroduced

## Files Touched

| Path | Change |
|---|---|
| `src/db/schema/vendor-price-lists.ts` | **new** |
| `src/db/schema/vendor-prices.ts` | **new** |
| `src/db/schema/bom-lines.ts` | add `subAssemblyRevisionId` |
| `src/db/schema/approvals.ts` | add `dueAt` |
| `src/db/schema/users.ts` | add `emailPrefs` |
| `src/server/actions/vendor-prices.ts` | **new** |
| `src/server/lib/approval-routing.ts` | **new** |
| `src/lib/email.ts` | new or extended |
| `src/app/(app)/vendors/[id]/page.tsx` | price-list editor |
| `src/app/(app)/audit/page.tsx` | **new** |
| `src/app/(app)/approvals/page.tsx` | deadlines, bulk reassign |
| `src/components/shell/nav-config.ts` | Audit entry |
| Various tests under `tests/unit/` and `tests/e2e/` | new coverage |

## Verification

Per feature, before shipping:

- [ ] `npm run lint` clean
- [ ] `npm test` passes
- [ ] `npm run test:e2e` passes
- [ ] Spec doc landed in the PR body before schema migration
- [ ] Manual end-to-end walk-through documented in PR description
- [ ] Audit-log entries created for every new mutation

## Notes / Decisions

- **Don't merge `feat/bom-versioning` blindly** (suggestion §6.5). It contains a pricing/stock removal that overlaps with vendor price lists — cherry-pick only what's compatible after price lists land.
- **Multi-level BOM is the largest single item here.** Resist starting it before vendor price lists; the latter clarifies the cost model that rendering and exports depend on.
- **Email pipeline order matters.** If Phase A drops magic link, this is net-new infra; if Phase A wires SES, extending it is mechanical. Decide before scoping.
- Per suggestion §6.8, avoid `docs/superpowers/` per-feature plan files — keep specs in PR descriptions and let `docs/plan.md` + these phase files be the only living planning artifacts.
