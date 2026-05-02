# Color refactor — black → blue, semantic timeline, badge consolidation

**Date:** 2026-05-03
**Status:** Approved
**Scope:** Single-PR design refactor

## Summary

The app currently runs two parallel color systems: a custom `--color-*` palette (already blue-accented) and the stock shadcn token set (`--primary` etc., near-black). Default `<Button>` and the unused shadcn `<Badge>` render black because they bind to shadcn `--primary`. Two `Badge` components also coexist — `src/components/ui/badge.tsx` (cva-based, unused) and `src/components/master/status-badge.tsx` (tone-based, used by all 9 consumers).

This refactor:

1. Retargets shadcn tokens onto the existing custom `--color-*` palette so both systems share one source of truth and every default button/border/ring becomes blue.
2. Promotes the tone-based `master/status-badge.tsx` to be the canonical `ui/badge.tsx`, dropping the unused cva variants. Adds an `accent` tone.
3. Adds semantic color + icon to the dashboard activity timeline, mapped from `activity.kind`.
4. Sweeps existing badge usages to confirm correct tone selection after the API merge.

## Non-goals

- Dark-mode token retarget — `.dark` block remains on grays. Follow-up.
- Replacing hardcoded `var(--color-text)` / `var(--color-line)` references in components with semantic shadcn equivalents.
- New icon set or icon-component refactor.
- Changing custom `--color-*` palette values.

## 1. Token consolidation

In `src/app/globals.css`, the `:root` block retargets shadcn tokens to reference the custom palette:

| shadcn token            | New value                          |
|-------------------------|------------------------------------|
| `--primary`             | `var(--color-accent)` (#3343d6)    |
| `--primary-foreground`  | `#ffffff`                          |
| `--destructive`         | `var(--color-danger)`              |
| `--accent`              | `var(--color-accent-soft)`         |
| `--accent-foreground`   | `var(--color-accent-text)`         |
| `--border`              | `var(--color-line)`                |
| `--input`               | `var(--color-line)`                |
| `--ring`                | `var(--color-accent)`              |
| `--muted`               | `var(--color-surface-2)`           |
| `--muted-foreground`    | `var(--color-text-3)`              |
| `--background`          | `var(--color-surface)`             |
| `--foreground`          | `var(--color-text)`                |
| `--card`                | `var(--color-surface)`             |
| `--card-foreground`     | `var(--color-text)`                |
| `--popover`             | `var(--color-surface)`             |
| `--popover-foreground`  | `var(--color-text)`                |
| `--secondary`           | `var(--color-surface-2)`           |
| `--secondary-foreground`| `var(--color-text)`                |

**Effect:** every `<Button>` without an explicit variant flips from black to blue. The `bg-primary/80` hover state derives blue at 80% via Tailwind's color-mix, which lands close to the predefined `--color-accent-hover`. Borders, focus rings, muted surfaces, popovers, and cards align to the existing app palette automatically.

**Out of scope:** the `.dark` block keeps its current oklch grays. Dark-mode retarget is a follow-up.

## 2. Badge consolidation

### Current state

- `src/components/ui/badge.tsx` — cva-based with `default`/`secondary`/`destructive`/`outline`/`ghost`/`link` variants. **Zero imports in the codebase.**
- `src/components/master/status-badge.tsx` — tone-based (`success`/`info`/`warning`/`danger`/`gray`) with `Badge`, `VendorStatusBadge`, `StockBadge` exports. Imported by 9 files.

### Plan

1. **Replace** `src/components/ui/badge.tsx` content with the tone-based `Badge` from `master/status-badge.tsx`. Add `accent` to the tone union for "informational, not muted" cases. Re-export `VendorStatusBadge` and `StockBadge` from the same file.
2. **Migrate** all 9 import sites to `@/components/ui/badge`.
3. **Delete** `src/components/master/status-badge.tsx` once imports are migrated.
4. **Drop** the cva-based variants (`default`/`secondary`/`outline`/`ghost`/`link`) — unused.

### New `Badge` API

```tsx
type Tone = "success" | "info" | "warning" | "danger" | "accent" | "gray";

<Badge tone="success">Approved</Badge>
<VendorStatusBadge status="preferred" />
<StockBadge state="low-stock" />
```

Tone → token mapping uses existing `--color-{tone}-soft` for backgrounds and `--color-{tone}` for text. The `accent` tone uses `--color-accent-soft` / `--color-accent-text`.

## 3. Activity timeline coloring

`src/components/dashboard/activity-timeline.tsx` gets a `kindStyle(kind: string)` helper that returns `{ tone, icon }`:

| Kind pattern (matched in order)            | Tone    | Icon                  |
|--------------------------------------------|---------|-----------------------|
| ends with `.approved` or `.created`        | success | `Icon.Check`          |
| ends with `.rejected` or `.deleted`        | danger  | `Icon.X`              |
| ends with `.imported` or `.updated`        | info    | `Icon.Upload` / `Icon.Edit` |
| starts with `stock.` or ends with `.alert` | warning | `Icon.AlertTriangle`  |
| (no match)                                 | accent  | `Icon.Activity`       |

### Render changes

- Dot: filled with the tone color (`bg-[var(--color-{tone})]`), border in matching tone.
- Icon: size 12, rendered inline before the summary text, color matches the tone.
- The "is most recent" highlight on `i === 0` is **removed** — color now comes from kind, not position.

### Implementation notes

- `kindStyle` is a local helper inside `activity-timeline.tsx` (no new file).
- Icons come from `src/components/icons.ts`. `Icon.Activity` and `Icon.AlertTriangle` are not currently exported — add them to `icons.ts` (lucide-react exports `Activity` and `AlertTriangle`).
- Unknown kinds fall through to the `accent` default — never crashes on new kinds.

## 4. Badge sweep

After the API merge, audit the 9 import sites to confirm tone choices match content meaning:

- `src/components/dashboard/projects-table.tsx` — BOM status badges
- `src/components/dashboard/stock-alerts.tsx` — already tone-correct
- `src/components/preview/approvers-card.tsx` — approver status
- `src/components/history/history-table.tsx` — history event tones
- `src/components/approvals/approval-status-badge.tsx` — already maps statuses correctly
- `src/components/builder/sectioned-line-table.tsx` — uses `StockBadge`, no change
- `src/app/(app)/builder/page.tsx`, `src/app/(app)/catalog/page.tsx`, `src/app/(app)/vendors/page.tsx` — page-level badges

Where a badge currently uses `gray` to mean "informational" (not "muted/inactive"), switch to `accent`. No tone change unless content semantics call for it.

## 5. Risk and rollback

- **Token change** is pure CSS in `globals.css`. Single-commit revert restores prior look exactly. No React component contracts change.
- **Badge merge** is the riskier piece. To avoid a half-state where two `Badge` exports diverge, the merge happens atomically: `ui/badge.tsx` is rewritten, all 9 imports updated, and `master/status-badge.tsx` deleted in the same commit.
- **Timeline change** is contained to one file; revert restores prior render.

## 6. Verification

- Manual visual pass: dashboard, builder, catalog, vendors, approvals, preview, sign-in/up — confirm primary buttons are blue, focus rings are blue, badges retain colors, timeline shows tone-coded entries.
- `npm run typecheck` after import sweep.
- No new automated tests — design-token + visual changes have no behavioral surface to assert against. Existing tests should remain green.

## 7. File-level change list

**Edited**
- `src/app/globals.css` — `:root` token retarget (table in §1)
- `src/components/ui/badge.tsx` — replaced with tone-based implementation
- `src/components/dashboard/activity-timeline.tsx` — `kindStyle` helper, dot color from tone, icon prefix
- `src/components/icons.ts` — add `Activity` / `AlertTriangle` if missing
- 9 badge consumer files — import path swap from `@/components/master/status-badge` to `@/components/ui/badge`

**Deleted**
- `src/components/master/status-badge.tsx`
