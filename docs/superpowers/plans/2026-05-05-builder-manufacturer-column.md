# Builder Manufacturer Column Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Manufacturer as a first-class, toggleable column in the BOM
builder line table (between Vendor and Unit), and remove the inline manufacturer
subtitle from the Description cell.

**Architecture:** Three small edits — extend the persisted column-visibility
store with an `mfr` key (with a migration so existing users see the column on
first load), add the label to the Columns dropdown, and render the new
header/cell in `sectioned-line-table.tsx`. End-to-end coverage via a Playwright
spec.

**Tech Stack:** Next.js 16, React 19, Zustand 5 (persist middleware), Playwright.

**Spec:** `docs/superpowers/specs/2026-05-05-builder-manufacturer-column-design.md`

---

## File Map

- **Modify** `src/stores/tweaks-store.ts` — add `"mfr"` to `ColumnKey`, add
  `mfr: true` default, bump persist version to 2, add migrate handler.
- **Modify** `src/components/builder/columns-menu.tsx` — add Manufacturer entry
  to `LABELS`, ordered between `vendor` and `unit`.
- **Modify** `src/components/builder/sectioned-line-table.tsx` — header,
  `LineRow` cell, `visibleColCount` increment, removal of inline subtitle.
- **Create** `tests/e2e/builder-manufacturer-column.spec.ts` — Playwright e2e
  verifying the new column renders, toggles, and that the Description cell no
  longer carries the inline manufacturer text.

---

## Task 1: Failing e2e test

**Files:**
- Create: `tests/e2e/builder-manufacturer-column.spec.ts`

- [ ] **Step 1.1: Write the failing test**

```typescript
import { test, expect } from "@playwright/test";
import { signUpAndGo } from "./helpers";

test("manufacturer is a toggleable column between Vendor and Unit", async ({ page }) => {
  await signUpAndGo(page, "/builder");
  await page.getByText("Northstar Beacon v3.2").click();
  await expect(page.getByRole("heading", { name: /Northstar Beacon v3\.2/ })).toBeVisible();

  // Header is present by default.
  const mfrHeader = page.getByRole("columnheader", { name: "Manufacturer" });
  await expect(mfrHeader).toBeVisible();

  // Header order: Vendor → Manufacturer → Unit.
  const headerTexts = await page.locator("thead th").allInnerTexts();
  const vendorIdx = headerTexts.findIndex(t => /Vendor/i.test(t));
  const mfrIdx = headerTexts.findIndex(t => /Manufacturer/i.test(t));
  const unitIdx = headerTexts.findIndex(t => /^Unit$/i.test(t));
  expect(vendorIdx).toBeGreaterThanOrEqual(0);
  expect(mfrIdx).toBe(vendorIdx + 1);
  expect(unitIdx).toBe(mfrIdx + 1);

  // Description cell no longer carries the muted manufacturer subtitle.
  // Take a row whose manufacturer cell has a non-empty value, and assert the
  // matching Description cell does NOT contain that text as a nested element.
  const firstRow = page.locator("tbody tr").first();
  const sampleMfr = (await firstRow.locator("td").nth(mfrIdx).innerText()).trim();
  if (sampleMfr && sampleMfr !== "—") {
    const descIdx = headerTexts.findIndex(t => /Description/i.test(t));
    const descCellText = await firstRow.locator("td").nth(descIdx).innerText();
    expect(descCellText).not.toContain(sampleMfr);
  }

  // Toggle off via the Columns menu and verify the column disappears.
  await page.getByRole("button", { name: /Columns/ }).click();
  await page.getByRole("menuitemcheckbox", { name: "Manufacturer" }).click();
  await expect(mfrHeader).toHaveCount(0);

  // Toggle back on.
  await page.getByRole("menuitemcheckbox", { name: "Manufacturer" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("columnheader", { name: "Manufacturer" })).toBeVisible();
});
```

- [ ] **Step 1.2: Run the test to confirm it fails**

Run: `npx playwright test tests/e2e/builder-manufacturer-column.spec.ts`
Expected: FAIL — the Manufacturer column does not yet exist, so
`getByRole("columnheader", { name: "Manufacturer" })` will not be visible.

- [ ] **Step 1.3: Commit the failing test**

```bash
git add tests/e2e/builder-manufacturer-column.spec.ts
git commit -m "test(builder): add e2e for manufacturer column toggle"
```

---

## Task 2: Add `mfr` to the tweaks store with persist migration

**Files:**
- Modify: `src/stores/tweaks-store.ts`

- [ ] **Step 2.1: Replace the file contents**

Full new content of `src/stores/tweaks-store.ts`:

```typescript
"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ColumnKey = "sku" | "desc" | "cat" | "vendor" | "mfr" | "unit" | "qty";

type State = {
  layout: "split" | "stacked";
  columns: Record<ColumnKey, boolean>;
};
type Actions = {
  setLayout: (l: "split" | "stacked") => void;
  toggleColumn: (k: ColumnKey) => void;
};

export const useTweaks = create<State & Actions>()(
  persist(
    set => ({
      layout: "split",
      columns: { sku: true, desc: true, cat: true, vendor: true, mfr: true, unit: true, qty: true },
      setLayout: layout => set({ layout }),
      toggleColumn: k =>
        set(s => ({ columns: { ...s.columns, [k]: !s.columns[k] } })),
    }),
    {
      name: "bom-tweaks",
      version: 2,
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Partial<State>;
        if (version < 2) {
          state.columns = {
            sku: true, desc: true, cat: true, vendor: true, mfr: true, unit: true, qty: true,
            ...(state.columns ?? {}),
            mfr: true,
          };
        }
        return state as State;
      },
    },
  ),
);
```

Why the migration: `persist` shallow-merges the stored `columns` object over
defaults, so existing users (version 1) would otherwise have `mfr: undefined`,
which renders as hidden. The migrate handler explicitly forces `mfr: true` for
those users.

- [ ] **Step 2.2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS — no errors. (Existing references to `ColumnKey` use the
indexed access `columns[k]`, which remains valid for the new key.)

- [ ] **Step 2.3: Commit**

```bash
git add src/stores/tweaks-store.ts
git commit -m "feat(builder): add mfr column key to tweaks store with v2 migration"
```

---

## Task 3: Add Manufacturer entry to the Columns menu

**Files:**
- Modify: `src/components/builder/columns-menu.tsx`

- [ ] **Step 3.1: Update the LABELS map**

Replace the `LABELS` constant. Final value:

```typescript
const LABELS: Record<ColumnKey, string> = {
  sku: "SKU / Part #",
  desc: "Description",
  cat: "Category",
  vendor: "Vendor",
  mfr: "Manufacturer",
  unit: "Unit",
  qty: "Quantity",
};
```

The `Object.keys(LABELS)` iteration in the existing render preserves insertion
order, so the menu will list Manufacturer between Vendor and Unit
automatically. No other changes needed in this file.

- [ ] **Step 3.2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3.3: Commit**

```bash
git add src/components/builder/columns-menu.tsx
git commit -m "feat(builder): list Manufacturer in columns menu"
```

---

## Task 4: Render the Manufacturer column in the line table

**Files:**
- Modify: `src/components/builder/sectioned-line-table.tsx`

- [ ] **Step 4.1: Update `visibleColCount`**

In `SectionedLineTable`, replace the existing `visibleColCount` `useMemo` body so that `mfr` is counted between `vendor` and `unit`:

```typescript
const visibleColCount = useMemo(() => {
  let n = 2; // # column + trash column
  if (columns.sku) n++;
  if (columns.desc) n++;
  if (columns.cat) n++;
  if (columns.vendor) n++;
  if (columns.mfr) n++;
  if (columns.unit) n++;
  if (columns.qty) n++;
  return n;
}, [columns]);
```

- [ ] **Step 4.2: Add the header `<Th>`**

In the `<thead>` block, insert the Manufacturer header between Vendor and
Unit. Final header row:

```tsx
<tr className="border-b border-[var(--color-line)] bg-[var(--color-surface)] text-[11px] uppercase tracking-wider text-[var(--color-text-3)]">
  <Th w={32}>#</Th>
  {columns.sku && <Th>SKU / Part #</Th>}
  {columns.desc && <Th>Description</Th>}
  {columns.cat && <Th>Category</Th>}
  {columns.vendor && <Th>Vendor</Th>}
  {columns.mfr && <Th>Manufacturer</Th>}
  {columns.unit && <Th>Unit</Th>}
  {columns.qty && <Th align="right">Qty</Th>}
  <Th w={32} />
</tr>
```

- [ ] **Step 4.3: Add the `LineRow` cell and remove the inline subtitle**

In `LineRow`, replace the Description cell and add the new Manufacturer cell.
Final structure for the cells from Description through Unit:

```tsx
{columns.desc && (
  <td className="px-3 py-2">{it.description}</td>
)}
{columns.cat && (
  <td className="px-3 py-2 text-[var(--color-text-3)]">
    {it.subcategoryName ?? it.categoryName ?? "—"}
  </td>
)}
{columns.vendor && <td className="px-3 py-2">{it.vendorName ?? "—"}</td>}
{columns.mfr && (
  <td className="px-3 py-2 text-[var(--color-text-3)]">
    {it.manufacturer || "—"}
  </td>
)}
{columns.unit && <td className="px-3 py-2 text-[var(--color-text-3)]">{it.unit}</td>}
```

The inline `<div className="text-[11px] text-[var(--color-text-3)]">{it.manufacturer}</div>`
that lived inside the Description cell is gone in this version — that is the
removal called for by the spec.

- [ ] **Step 4.4: Type-check and lint**

Run: `npx tsc --noEmit && npx eslint src/components/builder/sectioned-line-table.tsx`
Expected: PASS — no errors or new warnings.

- [ ] **Step 4.5: Run the failing e2e test from Task 1**

Run: `npx playwright test tests/e2e/builder-manufacturer-column.spec.ts`
Expected: PASS — the column appears, toggling works, and the inline subtitle
is gone (so the seed manufacturer text appears exactly once per row).

- [ ] **Step 4.6: Run the full e2e builder spec for regression**

Run: `npx playwright test tests/e2e/builder.spec.ts tests/e2e/builder-sections.spec.ts tests/e2e/preview.spec.ts`
Expected: PASS — existing builder, sections, and preview specs are not
affected because preview uses separate components and the table change is
purely additive (plus subtitle removal).

- [ ] **Step 4.7: Commit**

```bash
git add src/components/builder/sectioned-line-table.tsx
git commit -m "feat(builder): render Manufacturer column between Vendor and Unit"
```

---

## Task 5: Manual browser verification

This change is UI-visual; the e2e test guards structure and toggling, but a
human eyeball check on the actual rendering is still warranted per the project
guideline ("For UI or frontend changes, start the dev server and use the
feature in a browser before reporting the task as complete").

- [ ] **Step 5.1: Start the dev server**

Run: `npm run dev`

- [ ] **Step 5.2: In a browser, navigate to a seeded project's builder page**

- Sign up / sign in
- Open `/builder`
- Click into "Northstar Beacon v3.2"

- [ ] **Step 5.3: Verify rendering**

Confirm visually:
- The Manufacturer header sits between Vendor and Unit.
- Each row shows the manufacturer in its own cell, in the same muted style as
  Vendor/Category.
- The Description cell no longer shows manufacturer as a small grey subtitle.
- The Columns dropdown lists "Manufacturer" between "Vendor" and "Unit".
- Toggling Manufacturer off hides both the header and all cells; toggling it
  back on restores them.
- Empty manufacturer values (if any seed rows have them) render as `—`.

- [ ] **Step 5.4: Stop the dev server**

---

## Notes

- No schema, no server-action, no query changes. The `Line` type already
  includes `manufacturer: string` and the catalog/builder queries already
  select it.
- Read-only surfaces (preview, approvals, exports) don't share this component
  and are explicitly out of scope per the spec.
- The Zustand persist version bump is the only piece that touches existing
  user state. New users get the default; pre-existing users get the migration
  to ensure Manufacturer is on by default rather than mysteriously hidden.
