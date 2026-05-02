# BOM Studio — Bulk Catalog Import (design)

> Status: design / pre-plan
> Date: 2026-05-02
> Source backlog item: `#5` in `docs/superpowers/backlog.md`
> Successor: this design unblocks `#1` (vendor price lists), which will reuse
> the import pipeline introduced here.

## Goal

Let an authenticated org member upload an XLSX of catalog items, preview what
the import will do, and commit it — replacing the current one-by-one
"Add Item" dialog as the way to onboard or refresh a catalog.

The feature must:

- Accept a strict-template XLSX (single sheet, fixed column names).
- Show a dry-run preview with counts, auto-creates, and per-row errors before
  any DB write.
- Let the user choose "skip" or "update" for SKUs already in the catalog.
- Commit only the rows that pass validation; produce a downloadable
  `errors.xlsx` for the rest.
- Auto-create missing vendors / categories / subcategories with minimal
  defaults, surfacing what will be created in the dry-run.
- Emit one `audit_log` row per commit so the dashboard activity feed picks it
  up.

Out of scope for v1: column-mapping UI, CSV input, role-based gating, price-list
import (covered by `#1`).

## Locked decisions

| # | Decision |
|---|---|
| Q1 | Duplicate-SKU policy: per-import radio, default = **skip**, alternative = **update**. |
| Q2 | **Strict template** — fixed column names; mismatched header rejects the upload. |
| Q3 | Foreign keys identified by **human-readable codes/names** (`vendor_code`, `category`, `subcategory`); missing targets are flagged as auto-create candidates in the dry-run, user confirms via commit. |
| Q4 | **XLSX only**. Use `exceljs` (already in stack). CSV deferred. |
| Q5 | **Skip bad rows + downloadable `errors.xlsx`**. No threshold knob. |
| Q6 | Dry-run preview = **counts panel + error-rows-only table** (good rows summarized but not enumerated; downloadable as a dry-run report). |
| Q7 | **Separate route** at `/catalog/import`; **audit log on commit**; **no role gating** (any signed-in member). |
| Architecture | **Server parse + S3 staging** (Approach 1). Dry-run state held as the raw uploaded file in S3 under a 1-hour TTL key; commit re-fetches and re-parses. |

## Architecture & data flow

One trivial schema change: add `catalog.imported` to the existing
`audit_kind` enum (`src/db/schema/audit-log.ts`) via a Drizzle migration.
No new tables or columns. Staging lives in S3, not in Postgres.

```
[User uploads .xlsx]
        │
        ▼
┌──────────────────────────────────────────┐
│  Server Action: prepareImport(file)      │
│  1. Stream file to S3:                   │
│     org/<orgId>/imports/<importId>.xlsx  │
│  2. Parse with exceljs                   │
│  3. Validate every row                   │
│     - shape (required cols, types)       │
│     - FK lookups (vendor_code, category) │
│     - duplicate-SKU detection            │
│  4. Return DryRunResult:                 │
│     { importId, counts, errorRows,       │
│       newVendors[], newCategories[] }    │
└──────────────────────────────────────────┘
        │
        ▼
[Dry-run preview page renders DryRunResult]
        │
        ▼ user clicks "Import" (with skip|update radio)
        │
┌──────────────────────────────────────────┐
│  Server Action: commitImport(importId,   │
│                              duplicates) │
│  1. Re-fetch from S3, re-parse           │
│  2. Begin transaction:                   │
│     a. Insert new vendors                │
│     b. Insert new categories/subcats     │
│     c. Insert new items                  │
│     d. Update existing items (if upsert) │
│  3. Generate errors.xlsx → S3            │
│  4. Emit audit_log row                   │
│  5. Delete staging file                  │
│  6. Return CommitResult:                 │
│     { added, updated, skipped, errored,  │
│       errorsFileUrl?, vendorsCreated,    │
│       categoriesCreated }                │
└──────────────────────────────────────────┘
        │
        ▼
[Toast + redirect to /catalog]
```

### Invariants

- The `importId` is a cuid signed against the user's org. `commitImport`
  rejects mismatches.
- Staging files cleaned by an S3 lifecycle rule at the bucket level
  (1-hour TTL on the `imports/` prefix). Stale files self-clean even when
  users abandon mid-flow; the application code does not poll.
- Re-parsing on commit is intentional. It guarantees we apply exactly the file
  that was previewed — no risk of deserialization drift between preview and
  commit, and no need for a second source of truth.
- Validation errors are filtered _before_ the DB transaction. The transaction
  only sees rows that are guaranteed to insert/update cleanly.

### Race-condition policy

A user could dry-run a file, then a second user (or tab) could create a
conflicting item before the first user commits. We re-validate on commit using
the same logic as dry-run: a row that becomes a duplicate between dry-run and
commit is handled by the duplicate radio just like any other duplicate. The
post-commit toast shows the **actual** commit numbers, not the dry-run preview
numbers; we accept (and do not surface) any drift between them.

## Template, columns, validation

### Template

Static asset at `public/templates/catalog-import-template.xlsx`. One sheet
named `items`, header row in row 1, three example rows below. Downloaded via a
plain `<a href>` from the import page.

### Columns

| Column | Required | Type | Notes |
|---|---|---|---|
| `sku` | yes | string ≤64, trimmed | unique within org (`item_org_sku_uq`) |
| `description` | yes | string ≤500 | trimmed |
| `manufacturer` | yes | string ≤200 | trimmed |
| `unit` | no | string ≤16 | defaults to `pcs` if blank |
| `unit_price` | yes | number ≥0, up to 4 decimals | parsed via strict `Number()`, must be finite |
| `on_hand` | no | integer ≥0 | defaults to `0` if blank |
| `stock_state` | no | enum: `in-stock`/`low-stock`/`backorder`/`out-of-stock` | defaults to `in-stock` |
| `vendor_code` | no | string | matches `vendor.code` exactly (case-sensitive); blank = no vendor |
| `category` | no | string | matches `category.name` exactly (case-sensitive) |
| `subcategory` | no | string | matches `subcategory.name` within `category`; requires `category` set |

### Parsing rules

- Empty rows (every cell blank) skipped without comment.
- Whitespace trimmed on every string cell.
- Numeric cells accept Excel number format _or_ a string; coerced with strict
  `Number()` — `"$5.00"` and `"5,00"` are rejected as `bad_type`.
- Header row mismatch (any missing or unexpected column name) → upload
  rejected entirely with `header_mismatch` and a diff in the response.

### Per-row error categories

Each error row in the preview carries a machine-readable `reason`:

- `missing_required` — required column blank.
- `bad_type` — non-numeric `unit_price`, non-integer `on_hand`, etc.
- `bad_enum` — `stock_state` not one of the four allowed values.
- `bad_subcategory_without_category` — `subcategory` set but `category` blank.
- `subcategory_not_in_category` — both set but the subcategory does not belong
  to the given category.
- `duplicate_in_file` — same `sku` appears more than once in the same file.
  This is **always** an error regardless of the duplicate radio (the radio
  governs file-vs-DB collisions, not file-vs-file).

### Auto-create rules

Rows referencing missing FKs are not errors — they are flagged as auto-create
candidates in the dry-run preview. On commit:

- Missing `vendor_code` → `vendors` row inserted with
  `code = <vendor_code from file>, name = <same string as code>,
   country = "", leadTime = "", rating = 0, status = "approved",
   itemsCount = 0`. (The template carries no separate vendor-name column
   — the user can rename the vendor from the Vendors page after import.)
- Missing `category` name → `categories` row inserted with `name` only.
- Missing `subcategory` name → `subcategories` row inserted under the
  resolved (existing or just-created) category.

The dry-run preview groups all auto-creates into a collapsible panel above the
error table.

## Routes, UI, components

### Route

`/catalog/import` (RSC page). State lives in URL search params for
refresh-survival:

- `/catalog/import` → STATE A: empty upload screen.
- `/catalog/import?id=<importId>` → STATE B: dry-run preview. Server fetches
  `DryRunResult` from cache; if expired/missing, falls back to STATE A with a
  "session expired" notice.

### Entry point

The Catalog page (`/catalog`) gets a new "Import" button next to the existing
"Add Item" button. Single-line edit to `page-head`.

### STATE A — upload

- Header: "Import catalog" + breadcrumb "Catalog / Import".
- "Download template" link to the static asset.
- File-drop zone (`<input type="file" accept=".xlsx">` styled as a drop area).
- Instructions: column list + duplicate-SKU note.
- On select/drop, client posts to `prepareImport`. While pending, button shows
  spinner. On success, route changes to `?id=<importId>` (via
  `router.replace`, no full nav).

### STATE B — dry-run preview

- **Counts panel** (top): `1,832 rows parsed · 1,640 to add · 192 to update · 0 to skip · 18 errors`.
- **Auto-create panel** (collapsible, only shown if any): `Will create 5 new vendors, 2 new categories, 3 new subcategories`.
- **Errors panel** (only shown if any): table with columns `row #`, `sku`, `reason`, `value`. Virtualized via `@tanstack/react-virtual` only when row count > 500.
- **Duplicate-SKU radio**: `When a SKU already exists: ⦿ Skip ◯ Update`. Default = Skip.
- **Action row**: "Cancel" (returns to `/catalog`), "Download dry-run report" (XLSX with all parsed rows + status column), "Import" (primary).
- After commit: toast `1,640 added · 192 updated · 18 errors — [Download errors.xlsx]`, then redirect to `/catalog`.

The four counts are defined as:
- `added` — rows whose SKU was new and were inserted.
- `updated` — rows whose SKU existed and the radio was set to **Update**.
- `skipped` — rows whose SKU existed and the radio was set to **Skip**.
  (Always 0 when the radio is Update; equal to the file-vs-DB duplicate
  count when the radio is Skip.)
- `errored` — rows that failed validation and were excluded from the
  transaction.

### Component tree

```
src/app/(app)/catalog/import/
  page.tsx                     # RSC; reads ?id; routes to upload-zone OR preview
  preview-loader.tsx           # client; calls getDryRun(importId); renders preview

src/components/import/
  upload-zone.tsx              # client; file input + prepareImport call
  dry-run-counts.tsx           # presentational
  auto-create-panel.tsx        # collapsible; lists new vendors/categories
  error-table.tsx              # presentational; virtualized when rowCount > 500
  duplicate-policy-radio.tsx   # client; radio group, lifts state up
  commit-bar.tsx               # client; cancel + download + import buttons

src/server/
  actions/import.ts            # prepareImport, commitImport (Server Actions)
  queries/import.ts            # getDryRun(importId) — re-parses from S3
  lib/import-parser.ts         # pure: Buffer -> ParsedRow[] | HeaderError
  lib/import-validator.ts      # pure: ParsedRow[] + ctx -> DryRunResult

src/lib/s3.ts                  # extended; uploadStaging, getStaging, deleteStaging

public/templates/
  catalog-import-template.xlsx # static asset; checked in

src/db/schema/audit-log.ts     # extended; adds "catalog.imported" to enum
drizzle/                       # new migration file (drizzle-kit generate)
```

### Why parser and validator are separate pure functions

Each has a single, testable purpose. Parser knows
`Buffer → ParsedRow[]` (parsing concerns: headers, types, empty rows).
Validator knows `(ParsedRow[], ctx) → DryRunResult` (business concerns:
FK lookups, duplicates, auto-creates). This lets us unit-test validation
against thousands of synthetic rows without touching `exceljs` or S3, and the
validator can be reused unchanged when feature `#1` (price-list import)
arrives.

## Error handling & edge cases

### Failure modes

- File over 10 MB → reject before S3 write; inline "File too large".
- File not a valid XLSX (corrupt, password-protected, wrong type) → exceljs
  throws; `prepareImport` catches and returns `{ ok: false, error: "unreadable" }`;
  upload zone shows "Could not read file".
- Header row mismatch → `prepareImport` returns
  `{ ok: false, error: "header_mismatch", expected, found }`; UI shows the
  diff and a "Download template" reminder.
- All rows errored → preview renders the error table; "Import" button disabled
  with tooltip "No valid rows to import".
- S3 upload fails → return error to UI; user retries.
- Staging file expired between dry-run and commit (>1h) →
  `commitImport` returns `{ ok: false, error: "expired" }`; UI shows
  "Session expired, please re-upload" and resets to STATE A.
- Two tabs, same import → last commit wins; the second `commitImport` finds
  the staging file already deleted and returns `expired`. Acceptable.
- DB error inside the transaction (unexpected unique-constraint, etc.) →
  Drizzle rolls back; `commitImport` returns `{ ok: false, error }`; staging
  file is **not** deleted, so the user can retry.

### `errors.xlsx` generation

- Built only when at least one row errors on commit (dry-run errors plus any
  newly-introduced ones from the race window).
- Same column layout as the input + appended `error` column with the reason
  code.
- Uploaded to S3 at `org/<orgId>/imports/<importId>-errors.xlsx`,
  lifecycle-cleaned at 7 days.
- A presigned URL is returned in `CommitResult.errorsFileUrl`; rendered in the
  toast and stored in the audit-log row.

### Audit log

One `audit_log` row per **commit** (not per dry-run), shaped to match the
existing `auditLog` table in `src/db/schema/audit-log.ts`:

```ts
{
  organizationId,
  actorId: <current user>,
  kind: "catalog.imported",          // new enum value (migration adds it)
  refType: null,                     // import is a bulk action, not a single entity
  refId: null,
  summary: "Imported 1,640 items (192 updated, 18 errors)",
  payload: {
    fileName: "vendor-q1-2026.xlsx",
    counts: { added, updated, skipped, errored },
    autoCreated: { vendors, categories, subcategories },
    errorsFileUrl: "https://s3..." | null,
  },
}
```

The dashboard activity feed picks this up automatically — `ActivityTimeline`
renders the `summary` field directly, so no component change is required.
The query that feeds the timeline (`auditFeed` in `src/server/queries/dashboard.ts`)
also iterates all `kind` values, so it needs no change either.

## Testing

### Unit (Vitest)

- `tests/unit/server/import-parser.test.ts`
  - parses a well-formed XLSX into rows
  - rejects header mismatch with `header_mismatch`
  - skips fully-blank rows
  - trims whitespace on string cells
  - coerces numeric cells (number cell vs. string cell vs. invalid)
  - rejects unreadable buffer (corrupt XLSX)

- `tests/unit/server/import-validator.test.ts`
  - flags `missing_required`, `bad_type`, `bad_enum`
  - flags `bad_subcategory_without_category` and `subcategory_not_in_category`
  - detects `duplicate_in_file`
  - resolves vendor by `vendor_code` against fixture
  - flags missing vendor as auto-create candidate (not error)
  - flags missing category / subcategory as auto-create candidates
  - duplicate-vs-DB rows flagged as updates (not errors)

- `tests/unit/server/import-commit.test.ts` (test DB, isolated per test)
  - skip-duplicates path: existing items untouched, new items added
  - update-duplicates path: existing items overwritten with file values
  - auto-creates vendors / categories / subcategories before items reference
    them
  - transaction rolls back on simulated DB error (no partial state)
  - emits exactly one `audit_log` row with correct payload
  - generates `errors.xlsx` only when error rows exist

### E2E (Playwright)

`tests/e2e/catalog-import.spec.ts`:

1. Log in → `/catalog` → "Import".
2. Upload a fixture XLSX (5 good rows, 1 bad row, 1 row referencing a new
   vendor).
3. Assert dry-run counts panel shows
   `5 to add · 1 error · will create 1 vendor`.
4. Assert error table shows the bad row with reason.
5. Leave radio on default "Skip".
6. Click "Import".
7. Assert toast shows correct counts and an `errors.xlsx` download link.
8. Navigate back to `/catalog` → assert the 5 new items appear.
9. Navigate to `/dashboard` → assert the audit feed shows
   "imported N items".

### Fixtures

- `tests/fixtures/catalog-import/good.xlsx` — 5 valid rows.
- `tests/fixtures/catalog-import/with-errors.xlsx` — mix of good rows + each
  error category at least once.
- `tests/fixtures/catalog-import/header-mismatch.xlsx` — wrong header names.
- `tests/fixtures/catalog-import/big.xlsx` — 5,000 rows; generated by
  `tests/fixtures/catalog-import/generate-big.ts` (committed; XLSX itself is
  gitignored and regenerated locally).
- Perf assertion in unit tests: parsing + validating `big.xlsx` completes in
  under 2s on the test runner.

### Out of scope for tests

- Real S3 upload — mocked via the existing `src/lib/s3.ts` test double.
- `exceljs` internals.
- The static template file's contents — its existence is asserted in CI; its
  contents are eyeballed.
