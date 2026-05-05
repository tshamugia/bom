# Builder: Manufacturer Column

## Problem

In the BOM builder table, the manufacturer is rendered only as a small grey
subtitle under each row's Description cell. It has no header, no column-menu
entry, and no way to hide it. Users want manufacturer to be a first-class,
toggleable column like Vendor or Category.

## Decision

Add **Manufacturer** as a dedicated, toggleable column in the builder line
table, positioned after Vendor. Remove the inline manufacturer subtitle from
the Description cell — the column is the single source of truth.

Column order becomes: `# | SKU | Description | Category | Vendor | Manufacturer | Unit | Qty | trash`.

## Scope

In scope: builder line table only (`sectioned-line-table.tsx`), the columns
menu (`columns-menu.tsx`), and the persisted column-visibility store
(`tweaks-store.ts`).

Out of scope: preview, exports, CSV import, dashboard, catalog filters. None
of these currently use the Description-subtitle pattern, and the user did not
ask for them to be touched.

## Changes

### `src/stores/tweaks-store.ts`

- Extend `ColumnKey` union with `"mfr"`.
- Add `mfr: true` to the default `columns` record.
- Bump persist `version` to 2 and add a `migrate` handler that sets
  `columns.mfr = true` for state stored under version < 2. This ensures
  existing users see the new column on first load instead of getting
  `undefined` (which would render as hidden).

### `src/components/builder/columns-menu.tsx`

- Add `mfr: "Manufacturer"` to the `LABELS` record.
- Order keys to match table order: `sku, desc, cat, vendor, mfr, unit, qty`.

### `src/components/builder/sectioned-line-table.tsx`

- Header row: insert `{columns.mfr && <Th>Manufacturer</Th>}` between the
  Vendor and Unit headers.
- `LineRow`: insert the matching cell between Vendor and Unit, rendering
  `it.manufacturer` (or `"—"` when empty) with the same muted text style used
  by Vendor/Category cells.
- Remove the inline subtitle:
  `<div className="text-[11px] text-[var(--color-text-3)]">{it.manufacturer}</div>`
  from inside the Description `<td>`.
- `visibleColCount`: increment `n` when `columns.mfr` is true (alphabetical
  position in the calculation does not matter; just add the case).

## Non-changes

- The `Line` type already includes `manufacturer: string` — no type changes.
- Server queries already select manufacturer — no query changes.
- Read-only mode (preview / approvals) is unaffected because that table uses
  separate components.

## Acceptance

- Manufacturer column appears between Vendor and Unit in the builder table.
- Toggling "Manufacturer" in the Columns menu shows/hides it independently.
- The inline grey subtitle under Description is gone.
- Existing users with persisted column state see the new column on next load
  (migration ensures `mfr: true`).
- Empty manufacturer values render as `—`, matching the Vendor cell convention.
