# BOM Studio — Feature Backlog

Features brainstormed but not yet specced. Each one becomes its own design doc
under `docs/superpowers/specs/` and its own plan under `docs/superpowers/plans/`.

Sequencing matters where noted — `#5 → #1` share an import pipeline, so building
`#5` first lets `#1` reuse it instead of re-inventing it inside a larger spec.

---

## Recommended order

- [ ] **1. Bulk catalog import** (`#5`) — _start here_
- [ ] **2. Vendor price lists** (`#1`) — depends on `#5`'s import pipeline
- [ ] **3. BOM revision diff** (`#6`) — independent, can slot in anytime
- [ ] **4. Multi-level BOM** (`#3`) — independent, biggest schema change

---

## #5 — Bulk catalog import

Upload XLSX/CSV of items (sku / manufacturer / description / category /
subcategory / vendor / unit price / on-hand) with column mapping and a dry-run
preview before commit.

- **Size:** M
- **Why now:** Onboarding speed; no more one-by-one catalog entry. Builds the
  XLSX-upload + column-mapping + dry-run infrastructure that `#1` will reuse.
- **Touches:** `src/server/actions/items.ts`, new `src/components/import/*`,
  new `src/app/(app)/catalog/import/page.tsx`, items schema unchanged.
- **Open questions:** column-mapping UX (auto-detect vs. manual); duplicate-SKU
  policy (skip / update / fail); error-row download.

## #1 — Vendor price lists

Multi-vendor pricing per item: currency, MOQ, lead time, valid-from / valid-to,
quantity breaks. Bulk CSV/XLSX import (reuses `#5`'s pipeline). BOM cost rollup
chooses best price per line; the user can override per-line.

- **Size:** L
- **Depends on:** `#5` (import pipeline). Can be built standalone, but the
  import side would have to be designed generically from the start.
- **Touches:** new `vendor_prices` table, items pricing column becomes derived,
  Builder cost column, Preview totals, Dashboard tiles.
- **Open questions:** currency strategy (single vs. multi + FX); price-break
  evaluation (BOM line qty? project-wide qty?); how `items.unitPrice` migrates.

## #3 — Multi-level BOM

A BOM line can reference a sub-assembly (another project's revision) instead of
a leaf item. Cost rolls up through the hierarchy. Builder shows nested view;
exporter flattens or preserves hierarchy per user choice.

- **Size:** L
- **Independent.**
- **Touches:** `bom-lines` schema (add `sub_assembly_revision_id`), Builder
  tree view, exporter, Preview tally, cycle-detection.
- **Open questions:** circular-reference prevention; flatten-on-export default;
  how revisions of sub-assemblies update parents (pinned vs. floating).

## #6 — BOM revision diff

Side-by-side compare of two revisions of the same project: added / removed /
qty-changed / price-changed lines, with a cost delta summary.

- **Size:** M (smallest of the four)
- **Independent.**
- **Touches:** new `src/app/(app)/builder/[projectId]/diff/page.tsx`,
  new query in `src/server/queries/bom.ts`, no schema changes.
- **Open questions:** what counts as "changed" (just qty? price? both?); how
  diff appears in approvals (auto-show on send-for-review?).
