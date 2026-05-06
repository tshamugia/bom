# Phase B — Unwired UI Buttons

_Source: `docs/plan.md` §2.3, §3 steps 11–14 · Priority: **P1** · Estimate: ~1 day_

## Context

Several visible controls in the app currently do nothing on click — Catalog Export, Vendor Export, History Filter, and the topbar global search. They leak product surface area without delivering function. This phase wires each to a working server action / route handler so the UI matches expectations.

## Goals

- Catalog and Vendor pages produce downloadable XLSX files via the same S3 + presigned-URL pattern used by BOM exports.
- History page filters results by category and date range, with state in URL search params (shareable, back/forward navigable).
- Topbar search becomes a real Cmd+K command palette over projects, items, and vendors.

## Checklist

### 11. Catalog export
- [ ] `src/app/api/exports/catalog.xlsx/route.ts` (new) — GET handler, org-scoped, returns presigned URL or streams XLSX
- [ ] Reuse `src/lib/excel.ts` exporter helpers (mirror BOM export pattern)
- [ ] `src/app/(app)/catalog/page.tsx` — wire export button to the new route
- [ ] `audit(...)` call after export

### 12. Vendor export
- [ ] `src/app/api/exports/vendors.xlsx/route.ts` (new) — GET handler, org-scoped
- [ ] Reuse `src/lib/excel.ts`
- [ ] `src/app/(app)/vendors/page.tsx` — wire export button
- [ ] `audit(...)` call

### 13. History filters
- [ ] `src/app/(app)/history/page.tsx` — popover with:
  - category multi-select
  - date-range picker
- [ ] Filter state lives in URL search params (`?category=...&from=...&to=...`)
- [ ] Apply filters in the existing audit log query (org-scoped)

### 14. Topbar global search
- [ ] `src/components/shell/topbar.tsx` — replace stub `<input>` with Cmd+K command palette (shadcn `Command` primitive)
- [ ] Single server action queries projects, items, vendors (org-scoped, top-N each)
- [ ] Keyboard: `Cmd+K` / `Ctrl+K` opens; `Esc` closes; `Enter` navigates to the selected entity

## Files Touched

| Path | Change |
|---|---|
| `src/app/api/exports/catalog.xlsx/route.ts` | **new** |
| `src/app/api/exports/vendors.xlsx/route.ts` | **new** |
| `src/lib/excel.ts` | extract reusable export helpers if needed |
| `src/app/(app)/catalog/page.tsx` | wire export button |
| `src/app/(app)/vendors/page.tsx` | wire export button |
| `src/app/(app)/history/page.tsx` | filter popover + URL params |
| `src/server/queries/audit.ts` (or equivalent) | accept filter args |
| `src/components/shell/topbar.tsx` | command palette |
| `src/server/actions/search.ts` | **new** — global search action |

## Verification

- [ ] `npm run lint` clean
- [ ] `npm test` passes
- [ ] `npm run test:e2e` passes
- [ ] Manual:
  - Click Catalog → Export → file downloads, opens in Excel, content matches DB
  - Click Vendors → Export → same
  - History filter by category + date → row count drops accordingly; URL params reflect choice; sharing the URL reproduces the view
  - Cmd+K → type a project name → Enter → navigates to that project
- [ ] Audit log entries created for each export

## Notes / Decisions

- Use the same presigned-URL pattern as BOM exports (`src/app/api/exports/[id]/route.ts`) for consistency — don't stream directly from the route handler unless the file is small enough that S3 round-trips aren't worth it.
- The command palette is the right place to add future quick-actions (e.g. "New Project") later — keep its data-source layer pluggable.
