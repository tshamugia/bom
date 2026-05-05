# BOM list: Owner, Rev, Deadline columns

## Goal

Surface project ownership and active revision on the BOM list across the three places it appears, and rename the "Target" column to "Deadline" for clarity. Status remains as-is on all three.

## Affected pages

- Dashboard projects table — `src/components/dashboard/projects-table.tsx`
- BOM Builder index — `src/app/(app)/builder/page.tsx`
- Preview & Generate index — `src/app/(app)/preview/page.tsx`

## Data layer

Extend `listProjects()` in `src/server/queries/projects.ts`. All three pages already consume it (dashboard via `getProjectsForDashboard`, which just delegates), so one query change feeds everything.

Add two fields to the returned shape:

- `ownerName: string | null` — `LEFT JOIN "user" u ON u.id = p.owner_id`, select `u.name`.
- `revLetter: string | null` — add `r.letter AS "revLetter"` to the existing `LATERAL` subquery that already picks the active non-locked revision. No new join; same row that produces `lineCount` / `total`.

Update the inline TypeScript return type to include both fields, and remove the `as any` casts at the call sites.

## UI changes

### Dashboard `projects-table.tsx`

Columns left → right:

`Project · Owner · Rev · Lines · Total · Status · Updated · Deadline`

- Owner: `ownerName ?? "—"`, default text color.
- Rev: `Rev {revLetter}` when present (e.g. `Rev A`), else `—`. Use `font-mono text-[11px] text-[var(--color-text-3)]` to match the project code style.
- Deadline: rename header only; same `targetDate` value, same muted styling.

### BOM Builder index `src/app/(app)/builder/page.tsx`

Columns left → right:

`Project · Owner · Rev · Lines · Total · Status · Deadline`

Same rendering rules as the dashboard table. Update the empty-state `colSpan` to match the new column count.

### Preview & Generate index `src/app/(app)/preview/page.tsx`

Keep the list layout (no table conversion). Below the project name + code, add a single inline meta row separated by middle dots:

`Owner · Rev · Status badge · Deadline · {n} lines · ${total}`

The Status badge reuses the same conditional from the other two pages (`workflowStatus` → "Sent to procurement", `status === "in-progress"` → "In progress", else gray badge with raw status).

## Out of scope

- Sorting / filtering by Owner or Rev.
- Owner avatars or initials — text only.
- Backfilling missing `ownerId` data — null renders as `—`.
- Any change to the Status logic itself.
