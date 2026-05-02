# BOM Sections — Author-Defined Categories in the Builder

**Status:** approved (brainstorming)
**Author:** tshamugia
**Date:** 2026-05-03

## Problem

Today a BOM is a flat list of lines. When a project covers multiple subsystems (e.g., "Fire Alarm" and "IT Network"), authors have no way to title and group those subsystems inside a single BOM. The catalog has its own `category`/`subcategory` taxonomy on items, but that's a property of the part, not author intent — two projects may want the same item under different section titles, and a section may span items from multiple catalog categories.

## Goal

Let an author create titled sections inside one BOM revision, assign lines to them, and see those sections rendered as headings (with optional subtotals) on export and preview.

## Non-Goals (v1)

- Section-level notes, colors, or org-level reusable templates beyond the name-suggestion dropdown.
- A `section` column on CSV import.
- One sheet per section in xlsx (single grouped sheet only).
- Approval-workflow changes (section-level approvals).

## UX Decisions (locked during brainstorming)

| # | Decision |
|---|----------|
| Q1 | Sections are free-form per BOM. A dropdown surfaces previously-used names from across the org as suggestions. |
| Q2 | "Active section" model: one section is active; new lines added via search/import flow into it. Lines are draggable between sections. No per-row section picker. |
| Q3 | Lines without a section live under an implicit "Uncategorized" group rendered first. No forced default section. |
| Q4 | Export: single grouped sheet, sections shown as bold heading rows, optional per-section subtotal, page break before each non-first section. |
| Q5 | Subtotal cells live in **column J** (one column right of the grand total in column I) so they never double-count into the grand total. |
| Q6 | CSV import lands rows in Uncategorized for v1. |

## Data Model

### New table — `bom_section`

```ts
// src/db/schema/bom-sections.ts
export const bomSections = pgTable("bom_section", {
  id: text("id").primaryKey().$defaultFn(() => createId()),
  revisionId: text("revision_id").notNull()
    .references(() => bomRevisions.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  position: integer("position").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

Index: `CREATE INDEX bom_section_revision_idx ON bom_section(revision_id, position)`.

### Modified table — `bom_line`

Add nullable column:

```ts
sectionId: text("section_id").references(() => bomSections.id, { onDelete: "set null" })
```

Index: `CREATE INDEX bom_line_section_idx ON bom_line(section_id)`.

The existing unique index `(revision_id, item_id)` is preserved — an item lives in exactly one section per revision. Adding the same item to a second section is not supported in v1.

### Ordering

Lines are sorted by `(section_position NULLS FIRST, bom_line.position)`. Within a section, `bom_line.position` orders lines locally. Across sections, `bom_section.position` orders sections. Lines with `section_id = NULL` ("Uncategorized") render before all named sections.

### Migration

Single Drizzle migration `0007_*` adds the table, the column, and the two indexes. No data backfill — all existing lines have `section_id = NULL` and render in Uncategorized.

## Server Actions

New file `src/server/actions/bom-sections.ts`:

```ts
createSection({ revisionId, name }) → { id, name, position }
renameSection({ id, name })
reorderSection({ id, position })
deleteSection({ id, mode: "moveToUncategorized" | "deleteLines" })
listSectionSuggestions() → string[]
```

- All section-mutating actions reuse `ensureRevisionInOrg(revisionId)` for org-scoping and locked-revision rejection (`REVISION_LOCKED`).
- `reorderSection` rewrites sibling positions inside one transaction. Gaps are allowed; fractional indexing is not used in v1.
- `deleteSection` is caller-explicit; UI confirms before calling. `moveToUncategorized` sets `section_id = NULL` on the section's lines, then deletes the section row. `deleteLines` explicitly deletes the section's lines first (the FK is `ON DELETE SET NULL`, so a cascade would orphan them, not remove them), then deletes the section row. Both branches run in one transaction.
- `listSectionSuggestions` is org-scoped:

  ```sql
  SELECT name, COUNT(*) AS uses
  FROM bom_section bs
  INNER JOIN bom_revision r ON r.id = bs.revision_id
  INNER JOIN project p ON p.id = r.project_id
  WHERE p.organization_id = $org
  GROUP BY name
  ORDER BY uses DESC, name ASC
  LIMIT 50
  ```

Modified actions in `src/server/actions/bom-lines.ts`:

- `addLine({ revisionId, itemId, qty?, sectionId? })` — accepts optional `sectionId`. Validates that the section belongs to the same revision. Position is computed within the section: `MAX(position)+1 WHERE revision_id=$rev AND section_id IS NOT DISTINCT FROM $section`.
- `moveLineToSection({ lineId, sectionId, position })` — single transaction: removes the line from its source section's position sequence, inserts it at `position` in the destination section, rewrites affected siblings.

Audit kinds (logged via existing `audit()` helper):

- `bom.section.created` / `bom.section.renamed` / `bom.section.reordered` / `bom.section.deleted`
- `bom.line.moved` (only emitted when a move crosses sections; same-section reorder is silent)

Existing `bom.line.added` / `bom.line.removed` kinds are unchanged.

## Queries

`src/server/queries/projects.ts`:

- `getLines(revisionId)` — extend the select with `bomLines.sectionId`, plus `LEFT JOIN bom_section` for `sectionName` and `sectionPosition`. Order by `(section_position NULLS FIRST, bom_line.position)`. Return shape gains:

  ```ts
  sectionId: string | null;
  sectionName: string | null;
  sectionPosition: number | null;
  ```

- New `getSections(revisionId)` — returns `{ id, name, position, lineCount }[]` for builder/preview headers. `lineCount` derived from `getLines` in the page component (avoids a second round-trip).

## Builder UI

`src/components/builder/builder-shell.tsx` gains `activeSectionId` state, persisted to `sessionStorage` keyed by `revisionId`. The builder renders sections using a new `<SectionedLineTable>` component (the existing flat `BomLineTable` is replaced; `bom-line-table.tsx` either wraps it or is removed).

Visual structure:

```
┌─────────────────────────────────────────────┐
│ ▼ Uncategorized                       (3)   │  collapsible, hidden if empty
│   01  SKU-001  …                            │
├─────────────────────────────────────────────┤
│ ▼ Fire Alarm  ⋮  ●ACTIVE              (5)  │  active = bold border, "●" pill
│   01  SKU-101  …                            │
├─────────────────────────────────────────────┤
│ ▼ IT Network  ⋮                       (8)  │
└─────────────────────────────────────────────┘
[ + New section ]
```

### Section row

- Chevron (collapse/expand).
- Name (click to rename inline; Enter commits, Esc cancels).
- Line-count badge.
- Kebab `⋮` menu: Rename, Delete, Move up, Move down.
- "ACTIVE" indicator. Clicking the row sets it active.

### "+ New section" button (bottom)

Opens a popover with a combobox:

- `<input>` with autocomplete from `listSectionSuggestions()` (loaded once on mount; cached for the session).
- Free-typed names allowed. Enter or "Add" creates the section and makes it active.

### Active-section flow

- `SearchAddCombo` and `CsvImportDialog` read `activeSectionId` from context and pass it to `addLine` / `importCsv`. (CSV in v1 is unaffected — see Non-Goals; imported lines always go to Uncategorized for v1.)
- If no section is active, `addLine` is called with `sectionId: null` → line lands in Uncategorized.

### Drag and drop

- Lines draggable between sections and within (re-using row hover affordance for the drag handle).
- Sections draggable via a handle on the section header (kebab Move up/down available for keyboard users).
- Library: confirm during implementation whether `@dnd-kit/core` is already in `package.json`. If not, add it.
- On drop: server actions `moveLineToSection` (lines) and `reorderSection` (sections).

### Filter interaction

When `vendor`/`category`/`stock` filters are active, the existing flat filter applies, but the result is rendered grouped. Section headers with zero matches are hidden under that filter.

### Empty states

- No sections, no lines → existing "No items in this BOM yet" empty state.
- Sections exist but all are filtered to zero → existing empty-state copy can be reused with a "No items match the current filters" message.

## Export

`src/lib/excel.ts` and `src/server/actions/exports.ts`.

### `BomRow` change

```ts
export type BomRow = {
  // …existing
  sectionName: string | null;     // null = Uncategorized
  sectionPosition: number | null;
};
```

### `generateExport`

The `lines` query joins `bom_section` and selects `sectionName`, `sectionPosition`. Rows are ordered by `(sectionPosition NULLS FIRST, bom_line.position)`.

### `buildMainSheet` rendering

Single sheet, sections rendered inline:

```
Row 1   "Bill of Materials"
Row 2   PROJ-007 — Halcyon · Rev. C
Row 3   Owner / Target / Build qty
Row 5   #  SKU  Description  Manufacturer  Vendor  Unit  Qty  [Unit price]  [Total]  [Stock]   ← header (frozen)

Row 6   ── Uncategorized ──                      ← merged across visible columns; bold; fill #ECEEF2
Row 7   01 SKU-001 …
…

Row N   ── Fire Alarm ──
Row N+1 01 SKU-101 …
…
Row M       Subtotal — Fire Alarm  (col J)       ← only when includeVendorPricing
                                                  formula =SUM(I<sectionFirstDataRow>:I<sectionLastDataRow>)

Row M+1 ── IT Network ──
…

Final   Total  (col I)                            ← grand total, only when includeVendorPricing
                                                  =SUM(I<allDataRowsRange>)
```

Implementation notes:

- Build the sheet by iterating sections in order. Track `currentRow` and a running list of data-row indices.
- Section heading rows are merged across all visible columns, bold, light fill (`FFECEEF2`), with a thin top border for separation.
- The "#" column re-numbers from 1 within each section.
- A `pageBreak` is inserted before each non-first section heading (`ws.lastRow.addPageBreak()` or worksheet-level page break entry).
- **Subtotals go in column J**, never column I — this preserves the existing grand-total `SUM(I…)` over the full data range without double-counting.
- Grand total: heading rows in column I hold non-numeric text (the merged section title), and column I subtotal cells don't exist (subtotals are in J), so `=SUM(I<firstDataRow>:I<lastDataRow>)` over the entire data range works — Excel/`exceljs` `SUM` ignores text cells. The implementation tracks `firstDataRow` and `lastDataRow` and emits a single `SUM` range.

### Cover sheet (when `includeCoverPage`)

Adds a "Sections" block:

```
Sections
  Uncategorized   3 lines
  Fire Alarm      5 lines · $1,402.50
  IT Network      8 lines · $3,118.00
```

Per-section dollar totals are shown only when `includeVendorPricing` is true.

### `groupByVendor` option

Unchanged. Per-vendor sheets remain flat; sections are not nested inside them in v1.

## Preview Page

`src/app/(app)/preview/[projectId]/page.tsx` and `src/components/preview/preview-shell.tsx`.

The preview page reads section data via the same `getLines` (now section-aware) and renders a read-only version of the section grouping. The builder's `<SectionedLineTable>` is split so a presentational `<SectionedLineView>` can be reused by the preview without the inline-edit / drag affordances.

## Testing

### Unit / integration

- `bom-sections.actions.test.ts`
  - create / rename / reorder / delete (both modes)
  - org-scoping (cross-org access rejected)
  - locked-revision rejection for every mutating action
- `bom-lines.actions.test.ts` (extend)
  - `addLine` with `sectionId` happy path
  - `addLine` with a `sectionId` that belongs to a different revision → rejected
  - `moveLineToSection` cross-section move rewrites positions correctly
- `excel.test.ts`
  - mixed Uncategorized + named sections → heading rows merged, per-section numbering restarts at 1
  - subtotals appear in column J only when `includeVendorPricing` is true
  - grand total in column I sums all data rows and ignores subtotal cells
  - page breaks emitted before each non-first section heading

### E2E — `tests/e2e/builder-sections.spec.ts`

Author flow:
1. Open builder for a project with no lines.
2. Click "+ New section" → type "Fire Alarm" → confirm. Section becomes active.
3. Add two items via `SearchAddCombo`.
4. Create a second section "IT Network", add one item.
5. Drag a line from "Fire Alarm" into Uncategorized.
6. Rename "IT Network" to "Network".
7. Delete "Fire Alarm" with "move to Uncategorized" mode.
8. Generate an xlsx export; assert the workbook has heading rows for "Uncategorized" and "Network", that "#" restarts at 1 in each section, and that the grand total equals the qty×price sum of all lines.

## File Map

```
NEW   src/db/schema/bom-sections.ts
NEW   src/db/migrations/0007_*.sql                              (auto-generated)
NEW   src/server/actions/bom-sections.ts
NEW   src/components/builder/section-row.tsx
NEW   src/components/builder/sectioned-line-table.tsx
NEW   src/components/builder/new-section-popover.tsx
NEW   src/components/preview/sectioned-line-view.tsx            (read-only)
NEW   tests/e2e/builder-sections.spec.ts

EDIT  src/db/schema/bom-lines.ts                                (+ sectionId)
EDIT  src/db/schema/index.ts                                    (export bom-sections)
EDIT  src/server/actions/bom-lines.ts                           (sectionId on addLine; moveLineToSection)
EDIT  src/server/queries/projects.ts                            (getLines + new getSections)
EDIT  src/server/actions/exports.ts                             (select section fields)
EDIT  src/lib/excel.ts                                          (sectioned rendering, subtotals col J)
EDIT  src/components/builder/builder-shell.tsx                  (activeSectionId state, getSections prop)
EDIT  src/components/builder/bom-line-table.tsx                 (replaced or wrapped)
EDIT  src/components/preview/preview-shell.tsx                  (use sectioned read-only view)
EDIT  src/app/(app)/builder/[projectId]/page.tsx                (load sections)
EDIT  src/app/(app)/preview/[projectId]/page.tsx                (load sections)
```

## Open Questions

None at spec time; UX/data choices are locked above. Any new ambiguity that appears during implementation gets reflected back into this spec rather than resolved silently.
