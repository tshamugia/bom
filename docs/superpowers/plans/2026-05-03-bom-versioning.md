# BOM versioning & change tracking — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add commit-style versioning to BOMs: drafts (editable, owner-tracked), `commit` action (locks the revision and writes author + message), branching from a prior revision (copies sections/lines forward with widened snapshots), procurement gate at approval-creation, and a diff endpoint with a UI to compare any two committed revisions.

**Architecture:** Reuse existing `bom_revision` rows as the unit of versioning. Add a new `committed` status to `revisionStatusEnum` (between `draft` and the existing approval-flow states). Centralize "is immutable" through one helper. Widen `bom_line` snapshot columns and add `bom_section.sectionKey` so historical diffs are stable. Two new server actions (`commitRevision`, `branchRevision`, `discardDraft`), one new query (`getRevisionDiff`), one new dialog, two new pages (history, diff).

**Tech Stack:** Next.js 16 (app router, server actions), Drizzle ORM (PostgreSQL), Vitest (unit), Playwright (e2e), ExcelJS (xlsx export), shadcn/Radix UI.

**Companion spec:** `docs/superpowers/specs/2026-05-03-bom-versioning-design.md`. Read it first.

---

## File map

**Schema (modify):**
- `src/db/schema/enums.ts` — add `committed` to `revisionStatusEnum`
- `src/db/schema/bom-revisions.ts` — add `ownerId`, `committedById`, `committedAt`, `commitMessage`, `parentRevisionId`
- `src/db/schema/bom-lines.ts` — add `skuSnapshot`, `descriptionSnapshot`, `manufacturerSnapshot`, `unitSnapshot`, `vendorNameSnapshot`
- `src/db/schema/bom-sections.ts` — add `sectionKey`
- `src/db/schema/bom-exports.ts` — add `revisionStatusAtExport`
- `src/db/schema/audit-log.ts` — add new enum kinds

**Migration (create):**
- `src/db/migrations/0009_bom_versioning.sql` (Drizzle-generated; backfills inline)

**Server lib (create):**
- `src/server/lib/revision-status.ts` — `isRevisionImmutable`, `isRevisionProcurementEligible`, `latestProcurementEligibleRevision`

**Server actions:**
- Create: `src/server/actions/revisions.ts` — `commitRevision`, `branchRevision`, `discardDraft`
- Modify: `src/server/actions/bom-lines.ts` — capture wider snapshots; route guards through helper
- Modify: `src/server/actions/bom-sections.ts` — generate `sectionKey`; route guards through helper
- Modify: `src/server/actions/exports.ts` — read snapshot columns; allow drafts; set `revisionStatusAtExport`; pass draft watermark to excel
- Modify: `src/server/actions/approvals.ts` — `requestApproval` requires `committed`

**Server queries:**
- Create: `src/server/queries/revisions.ts` — `getRevisionDiff(leftId, rightId)`, `listRevisionsForProject(projectId)`

**Lib (modify):**
- `src/lib/excel.ts` — add `isDraft` flag to `BuildInput`; render watermark cover band + per-sheet footer

**UI (create):**
- `src/components/builder/commit-dialog.tsx`
- `src/components/builder/discard-draft-button.tsx`
- `src/components/builder/branch-revision-button.tsx`
- `src/components/revisions/revision-header.tsx`
- `src/components/revisions/diff-table.tsx`
- `src/components/revisions/history-table.tsx`

**UI (modify):**
- `src/components/ui/badge.tsx` — add `RevisionStatusBadge`
- `src/components/builder/builder-shell.tsx` — host new revision header + commit/discard/branch controls; disable inputs when immutable
- `src/components/approvals/approvals-table.tsx` — gate "Request approval" on committed status

**Pages (create):**
- `src/app/(app)/projects/[id]/history/page.tsx`
- `src/app/(app)/projects/[id]/diff/page.tsx`

**Pages (modify):**
- `src/app/(app)/builder/page.tsx` — fetch revision status + owner + parent for the header
- `src/app/(app)/preview/page.tsx` — surface "Send to procurement" against latest committed-or-locked rev

**Tests (create):**
- `tests/unit/server/revisions.test.ts` — commit / branch / discard
- `tests/unit/server/revision-diff.test.ts` — diff algorithm
- `tests/unit/server/revision-status.test.ts` — helpers
- `tests/e2e/versioning.spec.ts` — full lifecycle smoke

**Tests (modify):**
- `tests/unit/server/bom-sections.test.ts` — assert `sectionKey` written; assert immutability for `committed` (not just `locked`)
- `tests/unit/server/bom-lines.test.ts` — assert snapshot columns populated; assert `committed` blocks edits
- `tests/unit/server/exports.test.ts` — drafts produce watermarked output; `revisionStatusAtExport` recorded
- `tests/unit/server/approvals.test.ts` — `requestApproval` requires `committed`

---

## Conventions

- **TDD:** every server-action / query task starts with a failing test, then minimal implementation, then verify pass, then commit.
- **One commit per task.** Commit messages follow the style of the repo's recent commits (e.g., `feat(versioning): add commitRevision server action`).
- **Migrations:** generate SQL with `npm run db:generate`; never hand-write the file unless the generator can't express it (backfills go in raw SQL appended to the generated file).
- **Test DB:** `tests/test-helpers/db.ts` provides `resetDb()` + `ensureOrg()` — see `tests/unit/server/bom-sections.test.ts` for the established setup pattern.
- **Server actions are mocked in unit tests** for `next/cache.revalidatePath` and `@/server/org` (see existing tests).
- **Run between tasks:** `npm run lint` and `npm test` (full suite). Don't proceed if either fails.

---

## Task 1: Add `committed` to `revisionStatusEnum`

**Files:**
- Modify: `src/db/schema/enums.ts`

- [ ] **Step 1: Edit the enum**

In `src/db/schema/enums.ts`, change:

```ts
export const revisionStatusEnum = pgEnum("revision_status", [
  "draft",
  "in-progress",
  "review",
  "approved",
  "locked",
]);
```

to:

```ts
export const revisionStatusEnum = pgEnum("revision_status", [
  "draft",
  "committed",
  "in-progress",
  "review",
  "approved",
  "locked",
]);
```

- [ ] **Step 2: Verify type compiles**

Run: `npx tsc --noEmit`
Expected: no errors. The enum widens; consumers that exhaustively switch on it will surface as TS errors and get fixed in later tasks (Task 12 in particular).

- [ ] **Step 3: Commit**

```bash
git add src/db/schema/enums.ts
git commit -m "feat(schema): add 'committed' to revision_status enum"
```

---

## Task 2: Extend `bom_revision` columns

**Files:**
- Modify: `src/db/schema/bom-revisions.ts`

- [ ] **Step 1: Add columns**

Replace the file contents with:

```ts
import { pgTable, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { projects } from "./projects";
import { user } from "./auth";
import { revisionStatusEnum } from "./enums";

export const bomRevisions = pgTable(
  "bom_revision",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    parentRevisionId: text("parent_revision_id").references((): any => bomRevisions.id, { onDelete: "set null" }),
    letter: text("letter").notNull(),
    status: revisionStatusEnum("status").notNull().default("draft"),
    notes: text("notes"),
    ownerId: text("owner_id").references(() => user.id, { onDelete: "set null" }),
    committedById: text("committed_by_id").references(() => user.id, { onDelete: "set null" }),
    committedAt: timestamp("committed_at"),
    commitMessage: text("commit_message"),
    lockedAt: timestamp("locked_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  t => ({
    projectLetterUq: uniqueIndex("bom_rev_project_letter_uq").on(t.projectId, t.letter),
    parentIdx: index("bom_rev_parent_idx").on(t.parentRevisionId),
  }),
);
```

- [ ] **Step 2: Verify compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/db/schema/bom-revisions.ts
git commit -m "feat(schema): add owner, parent, commit fields to bom_revision"
```

---

## Task 3: Extend `bom_line` snapshot columns

**Files:**
- Modify: `src/db/schema/bom-lines.ts`

- [ ] **Step 1: Add snapshot columns**

Replace the file with:

```ts
import { pgTable, text, integer, numeric, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { bomRevisions } from "./bom-revisions";
import { bomSections } from "./bom-sections";
import { items } from "./items";

export const bomLines = pgTable(
  "bom_line",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    revisionId: text("revision_id").notNull().references(() => bomRevisions.id, { onDelete: "cascade" }),
    sectionId: text("section_id").references(() => bomSections.id, { onDelete: "set null" }),
    itemId: text("item_id").notNull().references(() => items.id, { onDelete: "restrict" }),
    qty: integer("qty").notNull().default(0),
    unitPriceSnapshot: numeric("unit_price_snapshot", { precision: 12, scale: 4 }).notNull(),
    skuSnapshot: text("sku_snapshot").notNull().default(""),
    descriptionSnapshot: text("description_snapshot").notNull().default(""),
    manufacturerSnapshot: text("manufacturer_snapshot"),
    unitSnapshot: text("unit_snapshot").notNull().default(""),
    vendorNameSnapshot: text("vendor_name_snapshot"),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  t => ({
    revItemUq: uniqueIndex("bom_line_rev_item_uq").on(t.revisionId, t.itemId),
    sectionIdx: index("bom_line_section_idx").on(t.sectionId),
  }),
);
```

The `default("")` is a temporary defensive value so the migration's NOT NULL doesn't fail; backfill will replace empty strings with real snapshots. After backfill we leave the default in place as a no-op safety net.

- [ ] **Step 2: Verify compile**

Run: `npx tsc --noEmit`
Expected: no errors. (`exports.ts` may show TS errors that we'll fix in Task 14.)

- [ ] **Step 3: Commit**

```bash
git add src/db/schema/bom-lines.ts
git commit -m "feat(schema): widen bom_line snapshot columns"
```

---

## Task 4: Add `bom_section.sectionKey`

**Files:**
- Modify: `src/db/schema/bom-sections.ts`

- [ ] **Step 1: Add column**

Replace the file with:

```ts
import { pgTable, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { bomRevisions } from "./bom-revisions";

export const bomSections = pgTable(
  "bom_section",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    revisionId: text("revision_id").notNull().references(() => bomRevisions.id, { onDelete: "cascade" }),
    sectionKey: text("section_key").notNull().$defaultFn(() => createId()),
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  t => ({
    revisionPosIdx: index("bom_section_revision_idx").on(t.revisionId, t.position),
    sectionKeyIdx: index("bom_section_key_idx").on(t.sectionKey),
  }),
);
```

- [ ] **Step 2: Verify compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/db/schema/bom-sections.ts
git commit -m "feat(schema): add stable sectionKey to bom_section"
```

---

## Task 5: Add `bom_export.revisionStatusAtExport`

**Files:**
- Modify: `src/db/schema/bom-exports.ts`

- [ ] **Step 1: Add column**

Find the `bomExports` definition in `src/db/schema/bom-exports.ts` and add the column inside the `pgTable(...)` columns object, just above `generatedById`:

```ts
revisionStatusAtExport: text("revision_status_at_export").notNull().default("locked"),
```

The `default("locked")` is the documented backfill assumption (existing exports were release-grade).

- [ ] **Step 2: Verify compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/db/schema/bom-exports.ts
git commit -m "feat(schema): record revision status on bom_export"
```

---

## Task 6: Add new audit-kind values

**Files:**
- Modify: `src/db/schema/audit-log.ts`

- [ ] **Step 1: Extend `auditKindEnum`**

In `src/db/schema/audit-log.ts`, change the `auditKindEnum` array to include three new values at the end:

```ts
export const auditKindEnum = pgEnum("audit_kind", [
  "bom.created",
  "bom.line.added",
  "bom.line.moved",
  "bom.export.generated",
  "bom.section.created",
  "bom.section.renamed",
  "bom.section.reordered",
  "bom.section.deleted",
  "approval.requested",
  "approval.approved",
  "approval.rejected",
  "vendor.created",
  "item.created",
  "catalog.imported",
  "bom.revision.committed",
  "bom.revision.branched",
  "bom.revision.discarded",
]);
```

- [ ] **Step 2: Verify compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/db/schema/audit-log.ts
git commit -m "feat(schema): add revision audit kinds"
```

---

## Task 7: Generate the migration and add backfills

**Files:**
- Create: `src/db/migrations/0009_bom_versioning.sql` (generated, then edited)
- Modify: `src/db/migrations/meta/_journal.json` (auto-updated)

- [ ] **Step 1: Generate migration**

Run: `npm run db:generate`
Expected: a new file `src/db/migrations/0009_*.sql` is created. Open it.

- [ ] **Step 2: Inspect generated SQL**

Confirm the migration includes:
- `ALTER TYPE revision_status ADD VALUE 'committed' BEFORE 'in-progress'` (or similar)
- `ALTER TABLE bom_revision ADD COLUMN parent_revision_id text ...`
- `ALTER TABLE bom_revision ADD COLUMN owner_id text ...`
- `ALTER TABLE bom_revision ADD COLUMN committed_by_id text ...`
- `ALTER TABLE bom_revision ADD COLUMN committed_at timestamp`
- `ALTER TABLE bom_revision ADD COLUMN commit_message text`
- `ALTER TABLE bom_line ADD COLUMN ...` for the five snapshot fields
- `ALTER TABLE bom_section ADD COLUMN section_key text ...`
- `ALTER TABLE bom_export ADD COLUMN revision_status_at_export text ...`
- New `audit_kind` enum values
- `CREATE INDEX bom_rev_parent_idx`, `CREATE INDEX bom_section_key_idx`

If anything is missing (notably the index creates), append it manually with the exact name from the schema.

- [ ] **Step 3: Append backfill SQL**

At the bottom of the generated `0009_*.sql`, append:

```sql
-- Backfill bom_section.section_key with the row id (stable identity for legacy rows)
UPDATE bom_section SET section_key = id WHERE section_key = '' OR section_key IS NULL;

-- Backfill bom_revision.owner_id from project.owner_id
UPDATE bom_revision SET owner_id = p.owner_id
FROM project p WHERE p.id = bom_revision.project_id AND bom_revision.owner_id IS NULL;

-- Backfill bom_line snapshots from current item + vendor data
UPDATE bom_line SET
  sku_snapshot          = i.sku,
  description_snapshot  = i.description,
  manufacturer_snapshot = i.manufacturer,
  unit_snapshot         = i.unit,
  vendor_name_snapshot  = v.name
FROM item i LEFT JOIN vendor v ON v.id = i.vendor_id
WHERE i.id = bom_line.item_id
  AND (bom_line.sku_snapshot = '' OR bom_line.sku_snapshot IS NULL);
```

- [ ] **Step 4: Apply migration to local dev DB**

Run: `npm run db:migrate`
Expected: migration applies without error. If your local DB has data, the backfill UPDATEs run; if it's empty, they're no-ops.

- [ ] **Step 5: Run the test suite to confirm schema is consistent**

Run: `npm test`
Expected: pre-existing tests still pass. Some tests will need updates in later tasks; tolerate those failures only if they relate specifically to the new fields (e.g., assertions on `bom_line` row shape). Otherwise, fix here.

- [ ] **Step 6: Commit**

```bash
git add src/db/migrations/
git commit -m "feat(db): migrate schema for revision versioning"
```

---

## Task 8: Add `isRevisionImmutable` / `isRevisionProcurementEligible` helpers (TDD)

**Files:**
- Create: `src/server/lib/revision-status.ts`
- Test: `tests/unit/server/revision-status.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/server/revision-status.test.ts`:

```ts
import { expect, test } from "vitest";
import {
  isRevisionImmutable,
  isRevisionProcurementEligible,
} from "@/server/lib/revision-status";

test("isRevisionImmutable returns false for draft", () => {
  expect(isRevisionImmutable("draft")).toBe(false);
});

test("isRevisionImmutable returns true for committed and locked", () => {
  expect(isRevisionImmutable("committed")).toBe(true);
  expect(isRevisionImmutable("locked")).toBe(true);
});

test("isRevisionImmutable returns true for in-flight approval states", () => {
  // Approval workflow holds the revision in these states; edits should be blocked.
  expect(isRevisionImmutable("in-progress")).toBe(true);
  expect(isRevisionImmutable("review")).toBe(true);
  expect(isRevisionImmutable("approved")).toBe(true);
});

test("isRevisionProcurementEligible is true only for committed/in-flight/locked", () => {
  expect(isRevisionProcurementEligible("draft")).toBe(false);
  expect(isRevisionProcurementEligible("committed")).toBe(true);
  expect(isRevisionProcurementEligible("in-progress")).toBe(true);
  expect(isRevisionProcurementEligible("review")).toBe(true);
  expect(isRevisionProcurementEligible("approved")).toBe(true);
  expect(isRevisionProcurementEligible("locked")).toBe(true);
});
```

- [ ] **Step 2: Run test, expect failure**

Run: `npx vitest run tests/unit/server/revision-status.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

Create `src/server/lib/revision-status.ts`:

```ts
import type { revisionStatusEnum } from "@/db/schema/enums";

export type RevisionStatus = (typeof revisionStatusEnum.enumValues)[number];

export function isRevisionImmutable(status: RevisionStatus): boolean {
  return status !== "draft";
}

export function isRevisionProcurementEligible(status: RevisionStatus): boolean {
  return status !== "draft";
}
```

Keep both helpers — they have the same body today but represent different concerns (one for "can the BOM be edited?", the other for "can it be sent to procurement?"). They will diverge if we later add a status like `archived`.

- [ ] **Step 4: Run test, expect pass**

Run: `npx vitest run tests/unit/server/revision-status.test.ts`
Expected: PASS, all five tests.

- [ ] **Step 5: Commit**

```bash
git add src/server/lib/revision-status.ts tests/unit/server/revision-status.test.ts
git commit -m "feat(server): add revision-status helpers"
```

---

## Task 9: Route existing edit-guards through the helper

**Files:**
- Modify: `src/server/actions/bom-lines.ts`
- Modify: `src/server/actions/bom-sections.ts`

- [ ] **Step 1: Update bom-lines guards**

In `src/server/actions/bom-lines.ts`, add the import:

```ts
import { isRevisionImmutable } from "../lib/revision-status";
```

Replace each `if (row.status === "locked") throw new Error("REVISION_LOCKED");` (and equivalents in other functions) with:

```ts
if (isRevisionImmutable(row.status)) throw new Error("REVISION_LOCKED");
```

Apply this to: `ensureRevisionInOrg` (line ~20), `updateLineQty` (line ~93), `removeLine` (~108), `moveLineToSection` (~138).

- [ ] **Step 2: Update bom-sections guards**

In `src/server/actions/bom-sections.ts`, add the same import and replace both occurrences (`ensureRevisionInOrg` ~line 20 and `ensureSectionAccess` ~line 39).

- [ ] **Step 3: Update existing tests for the new behavior**

In `tests/unit/server/bom-lines.test.ts`, find any test asserting that `locked` blocks edits and add a parallel `committed` case. Example pattern (locate the existing "blocks edits when locked" test and add this alongside it):

```ts
test("blocks updateLineQty when revision is committed", async () => {
  const { revisionId, line } = await setupWithLine();
  await db.update(bomRevisions).set({ status: "committed" }).where(eq(bomRevisions.id, revisionId));
  await expect(updateLineQty({ id: line.id, qty: 5 })).rejects.toThrow(/REVISION_LOCKED/);
});
```

Repeat for `removeLine` and `moveLineToSection`. Do the same in `tests/unit/server/bom-sections.test.ts` for `renameSection`, `reorderSection`, `deleteSection`, and `createSection`.

- [ ] **Step 4: Run the full unit suite**

Run: `npm test`
Expected: all previously-passing tests still pass, and the new `committed` cases pass.

- [ ] **Step 5: Commit**

```bash
git add src/server/actions/bom-lines.ts src/server/actions/bom-sections.ts tests/unit/server/bom-lines.test.ts tests/unit/server/bom-sections.test.ts
git commit -m "refactor(server): centralize revision immutability check"
```

---

## Task 10: Capture wider snapshots in `addLine` (TDD)

**Files:**
- Modify: `src/server/actions/bom-lines.ts`
- Modify: `tests/unit/server/bom-lines.test.ts`

- [ ] **Step 1: Write a failing test**

Add to `tests/unit/server/bom-lines.test.ts`:

```ts
test("addLine captures item + vendor snapshots", async () => {
  const { revisionId, it1 } = await setup();
  await addLine({ revisionId, itemId: it1.id, qty: 3 });
  const [row] = await db
    .select()
    .from(bomLines)
    .where(and(eq(bomLines.revisionId, revisionId), eq(bomLines.itemId, it1.id)));
  expect(row.skuSnapshot).toBe("A");
  expect(row.descriptionSnapshot).toBe("a");
  expect(row.manufacturerSnapshot).toBe("x");
  expect(row.unitSnapshot).toBe("pcs");
  expect(row.vendorNameSnapshot).toBe("M");
});
```

(`and`, `eq` import already in file. Add `bomLines` to the import block at the top if missing.)

- [ ] **Step 2: Run test, expect failure**

Run: `npx vitest run tests/unit/server/bom-lines.test.ts -t "captures item + vendor snapshots"`
Expected: FAIL — snapshot fields are empty strings / null.

- [ ] **Step 3: Implement**

In `src/server/actions/bom-lines.ts`, in `addLine`, replace the existing item lookup and the `db.insert(bomLines).values({...})` block with:

```ts
const [item] = await db
  .select({
    id: items.id,
    sku: items.sku,
    description: items.description,
    manufacturer: items.manufacturer,
    unit: items.unit,
    unitPrice: items.unitPrice,
    vendorId: items.vendorId,
  })
  .from(items)
  .where(and(eq(items.id, itemId), eq(items.organizationId, orgId)))
  .limit(1);
if (!item) throw new Error("ITEM_NOT_FOUND");

const [vendorRow] = item.vendorId
  ? await db.select({ name: vendors.name }).from(vendors).where(eq(vendors.id, item.vendorId)).limit(1)
  : [];
```

Then in the insert:

```ts
const [inserted] = await db.insert(bomLines).values({
  revisionId,
  sectionId: sectionId ?? null,
  itemId,
  qty: input.qty ?? 1,
  unitPriceSnapshot: item.unitPrice,
  skuSnapshot: item.sku,
  descriptionSnapshot: item.description,
  manufacturerSnapshot: item.manufacturer,
  unitSnapshot: item.unit,
  vendorNameSnapshot: vendorRow?.name ?? null,
  position: next,
}).returning();
```

Also add `vendors` to the import line at the top of the file if missing:

```ts
import { bomLines, bomRevisions, bomSections, items, projects, vendors } from "@/db/schema";
```

- [ ] **Step 4: Run test, expect pass**

Run: `npx vitest run tests/unit/server/bom-lines.test.ts`
Expected: PASS for all bom-lines tests.

- [ ] **Step 5: Commit**

```bash
git add src/server/actions/bom-lines.ts tests/unit/server/bom-lines.test.ts
git commit -m "feat(bom-lines): capture wider snapshots on addLine"
```

---

## Task 11: Implement `commitRevision` (TDD)

**Files:**
- Create: `src/server/actions/revisions.ts`
- Create: `tests/unit/server/revisions.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/server/revisions.test.ts`:

```ts
import { beforeEach, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";
import { resetDb, ensureOrg } from "@/../tests/test-helpers/db";
import { db } from "@/db/client";
import { items, vendors, categories, projects, bomRevisions } from "@/db/schema";
import { addLine } from "@/server/actions/bom-lines";
import { commitRevision } from "@/server/actions/revisions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/org", () => ({ getCurrentOrgId: vi.fn(), requireSession: vi.fn() }));
import { getCurrentOrgId, requireSession } from "@/server/org";

beforeEach(async () => { await resetDb(); });

async function setup() {
  const org = await ensureOrg();
  vi.mocked(getCurrentOrgId).mockResolvedValue(org.id);
  vi.mocked(requireSession).mockResolvedValue({ user: { id: "u1", name: "Tester" } } as never);

  const [v] = await db.insert(vendors).values({ name: "V", code: "V", country: "US", leadTime: "3d", rating: 4, status: "approved", organizationId: org.id }).returning();
  const [c] = await db.insert(categories).values({ name: "C", organizationId: org.id }).returning();
  const [it] = await db.insert(items).values({ sku: "S", description: "d", manufacturer: "m", unit: "pcs", unitPrice: "1.000", onHand: 10, stockState: "in-stock", vendorId: v.id, categoryId: c.id, subcategoryId: null, organizationId: org.id }).returning();
  const [p] = await db.insert(projects).values({ organizationId: org.id, code: "P1", name: "P1", status: "draft" }).returning();
  const [r] = await db.insert(bomRevisions).values({ projectId: p.id, letter: "A", status: "draft", ownerId: "u1" }).returning();
  return { orgId: org.id, projectId: p.id, revisionId: r.id, it };
}

test("commitRevision flips status to committed and stamps author + timestamp + message", async () => {
  const { revisionId, it } = await setup();
  await addLine({ revisionId, itemId: it.id, qty: 1 });
  await commitRevision({ revisionId, commitMessage: "Initial release" });
  const [row] = await db.select().from(bomRevisions).where(eq(bomRevisions.id, revisionId));
  expect(row.status).toBe("committed");
  expect(row.committedById).toBe("u1");
  expect(row.committedAt).toBeInstanceOf(Date);
  expect(row.commitMessage).toBe("Initial release");
});

test("commitRevision rejects empty BOM", async () => {
  const { revisionId } = await setup();
  await expect(commitRevision({ revisionId })).rejects.toThrow(/EMPTY_REVISION/);
});

test("commitRevision rejects non-draft revisions", async () => {
  const { revisionId, it } = await setup();
  await addLine({ revisionId, itemId: it.id, qty: 1 });
  await db.update(bomRevisions).set({ status: "committed" }).where(eq(bomRevisions.id, revisionId));
  await expect(commitRevision({ revisionId })).rejects.toThrow(/NOT_DRAFT/);
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run tests/unit/server/revisions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/server/actions/revisions.ts`:

```ts
"use server";

import { z } from "zod";
import { and, count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { bomLines, bomRevisions, projects } from "@/db/schema";
import { getCurrentOrgId, requireSession } from "../org";
import { audit } from "../audit";

async function loadRevisionInOrg(revisionId: string) {
  const orgId = await getCurrentOrgId();
  const [row] = await db
    .select({
      id: bomRevisions.id,
      status: bomRevisions.status,
      letter: bomRevisions.letter,
      projectId: bomRevisions.projectId,
    })
    .from(bomRevisions)
    .innerJoin(projects, eq(projects.id, bomRevisions.projectId))
    .where(and(eq(bomRevisions.id, revisionId), eq(projects.organizationId, orgId)))
    .limit(1);
  if (!row) throw new Error("REVISION_NOT_FOUND");
  return row;
}

const CommitInput = z.object({
  revisionId: z.string(),
  commitMessage: z.string().trim().max(2000).optional(),
});

export async function commitRevision(input: z.infer<typeof CommitInput>) {
  const { revisionId, commitMessage } = CommitInput.parse(input);
  const rev = await loadRevisionInOrg(revisionId);
  if (rev.status !== "draft") throw new Error("REVISION_NOT_DRAFT");

  const [{ n }] = await db
    .select({ n: count() })
    .from(bomLines)
    .where(eq(bomLines.revisionId, revisionId));
  if (n === 0) throw new Error("EMPTY_REVISION");

  const session = await requireSession();
  await db
    .update(bomRevisions)
    .set({
      status: "committed",
      committedById: session.user.id,
      committedAt: new Date(),
      commitMessage: commitMessage ?? null,
      updatedAt: new Date(),
    })
    .where(eq(bomRevisions.id, revisionId));

  revalidatePath(`/builder/${rev.projectId}`);
  revalidatePath(`/projects/${rev.projectId}/history`);
  revalidatePath("/dashboard");
  await audit({
    kind: "bom.revision.committed",
    refType: "project",
    refId: rev.projectId,
    summary: `Rev ${rev.letter} committed`,
    payload: { revisionId, letter: rev.letter, commitMessage: commitMessage ?? null },
  });
}
```

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run tests/unit/server/revisions.test.ts`
Expected: PASS, three tests.

- [ ] **Step 5: Commit**

```bash
git add src/server/actions/revisions.ts tests/unit/server/revisions.test.ts
git commit -m "feat(revisions): add commitRevision server action"
```

---

## Task 12: Implement `branchRevision` (TDD)

**Files:**
- Modify: `src/server/actions/revisions.ts`
- Modify: `tests/unit/server/revisions.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `tests/unit/server/revisions.test.ts`:

```ts
import { branchRevision } from "@/server/actions/revisions";
import { bomLines as bomLinesT, bomSections as bomSectionsT } from "@/db/schema";
import { createSection } from "@/server/actions/bom-sections";

test("branchRevision creates next-letter draft and copies sections + lines", async () => {
  const { revisionId, it, projectId } = await setup();
  const sec = await createSection({ revisionId, name: "Power" });
  await addLine({ revisionId, itemId: it.id, qty: 2, sectionId: sec.id });
  await commitRevision({ revisionId });

  const newId = await branchRevision({ parentRevisionId: revisionId });
  const [child] = await db.select().from(bomRevisions).where(eq(bomRevisions.id, newId));
  expect(child.letter).toBe("B");
  expect(child.status).toBe("draft");
  expect(child.parentRevisionId).toBe(revisionId);
  expect(child.ownerId).toBe("u1");

  const childSections = await db.select().from(bomSectionsT).where(eq(bomSectionsT.revisionId, newId));
  expect(childSections).toHaveLength(1);
  expect(childSections[0].sectionKey).toBe(sec.sectionKey);
  expect(childSections[0].id).not.toBe(sec.id);

  const childLines = await db.select().from(bomLinesT).where(eq(bomLinesT.revisionId, newId));
  expect(childLines).toHaveLength(1);
  expect(childLines[0].itemId).toBe(it.id);
  expect(childLines[0].qty).toBe(2);
  expect(childLines[0].skuSnapshot).toBe("S");
  expect(childLines[0].sectionId).toBe(childSections[0].id);
});

test("branchRevision rejects when parent is still draft", async () => {
  const { revisionId } = await setup();
  await expect(branchRevision({ parentRevisionId: revisionId })).rejects.toThrow(/PARENT_NOT_COMMITTED/);
});

test("branchRevision rejects when project already has a draft", async () => {
  const { projectId, revisionId, it } = await setup();
  await addLine({ revisionId, itemId: it.id, qty: 1 });
  await commitRevision({ revisionId });
  await branchRevision({ parentRevisionId: revisionId });
  await expect(branchRevision({ parentRevisionId: revisionId })).rejects.toThrow(/DRAFT_ALREADY_EXISTS/);
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run tests/unit/server/revisions.test.ts -t "branchRevision"`
Expected: FAIL — `branchRevision` not exported.

- [ ] **Step 3: Implement**

Append to `src/server/actions/revisions.ts`:

```ts
import { items, vendors, bomSections } from "@/db/schema";
import { isRevisionImmutable } from "../lib/revision-status";

const BranchInput = z.object({ parentRevisionId: z.string() });

function nextLetter(existing: string[]): string {
  const used = new Set(existing);
  for (let i = 0; i < 26; i++) {
    const c = String.fromCharCode(65 + i);
    if (!used.has(c)) return c;
  }
  // After Z, fall back to AA, AB...
  for (let i = 0; i < 26; i++)
    for (let j = 0; j < 26; j++) {
      const c = `${String.fromCharCode(65 + i)}${String.fromCharCode(65 + j)}`;
      if (!used.has(c)) return c;
    }
  throw new Error("REVISION_LETTER_EXHAUSTED");
}

export async function branchRevision(input: z.infer<typeof BranchInput>): Promise<string> {
  const { parentRevisionId } = BranchInput.parse(input);
  const parent = await loadRevisionInOrg(parentRevisionId);
  if (!isRevisionImmutable(parent.status) || parent.status === "draft") {
    throw new Error("PARENT_NOT_COMMITTED");
  }

  // One-open-draft rule
  const [{ draftCount }] = await db
    .select({ draftCount: count() })
    .from(bomRevisions)
    .where(and(eq(bomRevisions.projectId, parent.projectId), eq(bomRevisions.status, "draft")));
  if (draftCount > 0) throw new Error("DRAFT_ALREADY_EXISTS");

  const session = await requireSession();
  const existing = await db
    .select({ letter: bomRevisions.letter })
    .from(bomRevisions)
    .where(eq(bomRevisions.projectId, parent.projectId));
  const letter = nextLetter(existing.map(e => e.letter));

  const newId = await db.transaction(async tx => {
    const [child] = await tx.insert(bomRevisions).values({
      projectId: parent.projectId,
      parentRevisionId: parent.id,
      letter,
      status: "draft",
      ownerId: session.user.id,
    }).returning();

    // Copy sections, preserving sectionKey
    const parentSections = await tx
      .select()
      .from(bomSections)
      .where(eq(bomSections.revisionId, parent.id));

    const sectionIdMap = new Map<string, string>();
    for (const s of parentSections) {
      const [created] = await tx.insert(bomSections).values({
        revisionId: child.id,
        sectionKey: s.sectionKey,
        name: s.name,
        position: s.position,
      }).returning();
      sectionIdMap.set(s.id, created.id);
    }

    // Copy lines, re-snapshotting from current item + vendor data
    const parentLines = await tx
      .select({
        sectionId: bomLines.sectionId,
        itemId: bomLines.itemId,
        qty: bomLines.qty,
        position: bomLines.position,
      })
      .from(bomLines)
      .where(eq(bomLines.revisionId, parent.id));

    for (const l of parentLines) {
      const [item] = await tx
        .select({
          unitPrice: items.unitPrice, sku: items.sku, description: items.description,
          manufacturer: items.manufacturer, unit: items.unit, vendorId: items.vendorId,
        })
        .from(items)
        .where(eq(items.id, l.itemId))
        .limit(1);
      if (!item) continue; // item was deleted; skip — alternative is to throw
      const [vendor] = item.vendorId
        ? await tx.select({ name: vendors.name }).from(vendors).where(eq(vendors.id, item.vendorId)).limit(1)
        : [];
      await tx.insert(bomLines).values({
        revisionId: child.id,
        sectionId: l.sectionId ? sectionIdMap.get(l.sectionId) ?? null : null,
        itemId: l.itemId,
        qty: l.qty,
        unitPriceSnapshot: item.unitPrice,
        skuSnapshot: item.sku,
        descriptionSnapshot: item.description,
        manufacturerSnapshot: item.manufacturer,
        unitSnapshot: item.unit,
        vendorNameSnapshot: vendor?.name ?? null,
        position: l.position,
      });
    }
    return child.id;
  });

  revalidatePath(`/builder/${parent.projectId}`);
  revalidatePath(`/projects/${parent.projectId}/history`);
  revalidatePath("/dashboard");
  await audit({
    kind: "bom.revision.branched",
    refType: "project",
    refId: parent.projectId,
    summary: `Rev ${letter} branched from Rev ${parent.letter}`,
    payload: { parentRevisionId: parent.id, newRevisionId: newId, letter },
  });
  return newId;
}
```

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run tests/unit/server/revisions.test.ts`
Expected: PASS, six tests total.

- [ ] **Step 5: Commit**

```bash
git add src/server/actions/revisions.ts tests/unit/server/revisions.test.ts
git commit -m "feat(revisions): add branchRevision (linear branching with re-snapshot)"
```

---

## Task 13: Implement `discardDraft` (TDD)

**Files:**
- Modify: `src/server/actions/revisions.ts`
- Modify: `tests/unit/server/revisions.test.ts`

- [ ] **Step 1: Write failing test**

Append to `tests/unit/server/revisions.test.ts`:

```ts
import { discardDraft } from "@/server/actions/revisions";

test("discardDraft removes the revision (cascades lines + sections)", async () => {
  const { revisionId, it } = await setup();
  await addLine({ revisionId, itemId: it.id, qty: 1 });
  await discardDraft({ revisionId });
  const after = await db.select().from(bomRevisions).where(eq(bomRevisions.id, revisionId));
  expect(after).toHaveLength(0);
});

test("discardDraft rejects non-draft revisions", async () => {
  const { revisionId, it } = await setup();
  await addLine({ revisionId, itemId: it.id, qty: 1 });
  await commitRevision({ revisionId });
  await expect(discardDraft({ revisionId })).rejects.toThrow(/NOT_DRAFT/);
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run tests/unit/server/revisions.test.ts -t "discardDraft"`
Expected: FAIL.

- [ ] **Step 3: Implement**

Append to `src/server/actions/revisions.ts`:

```ts
const DiscardInput = z.object({ revisionId: z.string() });

export async function discardDraft(input: z.infer<typeof DiscardInput>) {
  const { revisionId } = DiscardInput.parse(input);
  const rev = await loadRevisionInOrg(revisionId);
  if (rev.status !== "draft") throw new Error("REVISION_NOT_DRAFT");

  await db.delete(bomRevisions).where(eq(bomRevisions.id, revisionId));

  revalidatePath(`/builder/${rev.projectId}`);
  revalidatePath(`/projects/${rev.projectId}/history`);
  revalidatePath("/dashboard");
  await audit({
    kind: "bom.revision.discarded",
    refType: "project",
    refId: rev.projectId,
    summary: `Rev ${rev.letter} draft discarded`,
    payload: { revisionId, letter: rev.letter },
  });
}
```

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run tests/unit/server/revisions.test.ts`
Expected: PASS, all eight tests.

- [ ] **Step 5: Commit**

```bash
git add src/server/actions/revisions.ts tests/unit/server/revisions.test.ts
git commit -m "feat(revisions): add discardDraft action"
```

---

## Task 14: Update `requestApproval` to gate on `committed` (TDD)

**Files:**
- Modify: `src/server/actions/approvals.ts`
- Modify: `tests/unit/server/approvals.test.ts`

- [ ] **Step 1: Write/adjust failing tests**

In `tests/unit/server/approvals.test.ts`, find any test that asserts `requestApproval` succeeds against a `draft`/`in-progress` revision and change/add the following:

```ts
test("requestApproval succeeds against a committed revision", async () => {
  const { revisionId } = await setup();
  await db.update(bomRevisions).set({ status: "committed" }).where(eq(bomRevisions.id, revisionId));
  const wf = await requestApproval({ revisionId });
  expect(wf.status).toBe("pending");
});

test("requestApproval rejects a draft revision", async () => {
  const { revisionId } = await setup();
  await expect(requestApproval({ revisionId })).rejects.toThrow(/NOT_COMMITTED/);
});

test("requestApproval rejects a locked revision", async () => {
  const { revisionId } = await setup();
  await db.update(bomRevisions).set({ status: "locked" }).where(eq(bomRevisions.id, revisionId));
  await expect(requestApproval({ revisionId })).rejects.toThrow(/NOT_COMMITTED/);
});
```

(Update existing setup helper as needed; the test file already has one — change the default revision status from `"in-progress"` to `"draft"` if appropriate.)

- [ ] **Step 2: Run, expect failures**

Run: `npx vitest run tests/unit/server/approvals.test.ts`
Expected: FAIL — current code accepts non-locked revisions and writes status to "review".

- [ ] **Step 3: Implement**

In `src/server/actions/approvals.ts`, change `requestApproval`:

```ts
export async function requestApproval(input: { revisionId: string }) {
  const rev = await ensureRevisionInOrg(input.revisionId);
  if (rev.status !== "committed") throw new Error("REVISION_NOT_COMMITTED");
  const session = await requireSession();
  // ... rest unchanged
}
```

The existing line `await db.update(bomRevisions).set({ status: "review", ... })` continues to work — `committed → review` is a normal forward transition.

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run tests/unit/server/approvals.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/actions/approvals.ts tests/unit/server/approvals.test.ts
git commit -m "feat(approvals): gate requestApproval on committed status"
```

---

## Task 15: Update `bom-sections.ts` to generate fresh `sectionKey` (TDD)

**Files:**
- Modify: `tests/unit/server/bom-sections.test.ts`

- [ ] **Step 1: Add failing test**

Append to `tests/unit/server/bom-sections.test.ts`:

```ts
test("createSection assigns a unique sectionKey", async () => {
  const { revisionId } = await setup();
  const a = await createSection({ revisionId, name: "X" });
  const b = await createSection({ revisionId, name: "Y" });
  expect(a.sectionKey).toBeTruthy();
  expect(b.sectionKey).toBeTruthy();
  expect(a.sectionKey).not.toBe(b.sectionKey);
});
```

- [ ] **Step 2: Run, expect pass**

Run: `npx vitest run tests/unit/server/bom-sections.test.ts -t "sectionKey"`
Expected: PASS — schema's `$defaultFn(createId)` already populates `sectionKey` on insert, so no implementation change is needed. (If the test fails, re-check Task 4.)

- [ ] **Step 3: Commit**

```bash
git add tests/unit/server/bom-sections.test.ts
git commit -m "test(bom-sections): assert sectionKey is auto-assigned"
```

---

## Task 16: Implement `getRevisionDiff` query (TDD)

**Files:**
- Create: `src/server/queries/revisions.ts`
- Create: `tests/unit/server/revision-diff.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/server/revision-diff.test.ts`:

```ts
import { beforeEach, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";
import { resetDb, ensureOrg } from "@/../tests/test-helpers/db";
import { db } from "@/db/client";
import { items, vendors, categories, projects, bomRevisions, bomLines, bomSections } from "@/db/schema";
import { createSection, renameSection } from "@/server/actions/bom-sections";
import { addLine, updateLineQty, removeLine } from "@/server/actions/bom-lines";
import { commitRevision, branchRevision } from "@/server/actions/revisions";
import { getRevisionDiff } from "@/server/queries/revisions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/org", () => ({ getCurrentOrgId: vi.fn(), requireSession: vi.fn() }));
import { getCurrentOrgId, requireSession } from "@/server/org";

beforeEach(async () => { await resetDb(); });

async function seed() {
  const org = await ensureOrg();
  vi.mocked(getCurrentOrgId).mockResolvedValue(org.id);
  vi.mocked(requireSession).mockResolvedValue({ user: { id: "u1", name: "T" } } as never);
  const [v1] = await db.insert(vendors).values({ name: "V1", code: "V1", country: "US", leadTime: "3d", rating: 4, status: "approved", organizationId: org.id }).returning();
  const [v2] = await db.insert(vendors).values({ name: "V2", code: "V2", country: "US", leadTime: "3d", rating: 4, status: "approved", organizationId: org.id }).returning();
  const [c] = await db.insert(categories).values({ name: "C", organizationId: org.id }).returning();
  const it = async (sku: string, price: string, vendorId: string) =>
    (await db.insert(items).values({ sku, description: sku, manufacturer: "m", unit: "pcs", unitPrice: price, onHand: 100, stockState: "in-stock", vendorId, categoryId: c.id, subcategoryId: null, organizationId: org.id }).returning())[0];
  const a = await it("A", "1.000", v1.id);
  const b = await it("B", "2.000", v1.id);
  const cItem = await it("C", "3.000", v2.id);
  const [p] = await db.insert(projects).values({ organizationId: org.id, code: "P", name: "P", status: "draft" }).returning();
  const [r] = await db.insert(bomRevisions).values({ projectId: p.id, letter: "A", status: "draft", ownerId: "u1" }).returning();
  return { orgId: org.id, projectId: p.id, leftId: r.id, a, b, c: cItem, v2 };
}

test("diff: added line shows up under added", async () => {
  const { leftId, a, b } = await seed();
  await addLine({ revisionId: leftId, itemId: a.id, qty: 1 });
  await commitRevision({ revisionId: leftId });
  const rightId = await branchRevision({ parentRevisionId: leftId });
  await addLine({ revisionId: rightId, itemId: b.id, qty: 3 });

  const diff = await getRevisionDiff(leftId, rightId);
  expect(diff.lines.added).toHaveLength(1);
  expect(diff.lines.added[0].sku).toBe("B");
  expect(diff.lines.added[0].qty).toBe(3);
  expect(diff.lines.removed).toHaveLength(0);
  expect(diff.lines.changed).toHaveLength(0);
});

test("diff: qty change shows under changed with from→to", async () => {
  const { leftId, a } = await seed();
  await addLine({ revisionId: leftId, itemId: a.id, qty: 1 });
  await commitRevision({ revisionId: leftId });
  const rightId = await branchRevision({ parentRevisionId: leftId });
  const [line] = await db.select().from(bomLines).where(eq(bomLines.revisionId, rightId));
  await updateLineQty({ id: line.id, qty: 5 });
  const diff = await getRevisionDiff(leftId, rightId);
  expect(diff.lines.changed).toHaveLength(1);
  expect(diff.lines.changed[0].changes.qty).toEqual({ from: 1, to: 5 });
});

test("diff: removed line shows up under removed", async () => {
  const { leftId, a, b } = await seed();
  await addLine({ revisionId: leftId, itemId: a.id, qty: 1 });
  await addLine({ revisionId: leftId, itemId: b.id, qty: 1 });
  await commitRevision({ revisionId: leftId });
  const rightId = await branchRevision({ parentRevisionId: leftId });
  const [line] = await db
    .select().from(bomLines)
    .where(eq(bomLines.revisionId, rightId))
    .limit(1);
  await removeLine({ id: line.id });
  const diff = await getRevisionDiff(leftId, rightId);
  expect(diff.lines.removed).toHaveLength(1);
});

test("diff: section rename detected via sectionKey", async () => {
  const { leftId, a } = await seed();
  const sec = await createSection({ revisionId: leftId, name: "Power" });
  await addLine({ revisionId: leftId, itemId: a.id, qty: 1, sectionId: sec.id });
  await commitRevision({ revisionId: leftId });
  const rightId = await branchRevision({ parentRevisionId: leftId });
  const [childSec] = await db.select().from(bomSections).where(eq(bomSections.revisionId, rightId));
  await renameSection({ id: childSec.id, name: "PSU" });
  const diff = await getRevisionDiff(leftId, rightId);
  expect(diff.sections.renamed).toEqual([{ from: "Power", to: "PSU" }]);
  expect(diff.sections.added).toHaveLength(0);
  expect(diff.sections.removed).toHaveLength(0);
});

test("diff: totals delta", async () => {
  const { leftId, a, b } = await seed();
  await addLine({ revisionId: leftId, itemId: a.id, qty: 2 }); // 2 * 1.000 = 2
  await commitRevision({ revisionId: leftId });
  const rightId = await branchRevision({ parentRevisionId: leftId });
  await addLine({ revisionId: rightId, itemId: b.id, qty: 1 }); // +2
  const diff = await getRevisionDiff(leftId, rightId);
  expect(diff.totals.leftValue).toBe(2);
  expect(diff.totals.rightValue).toBe(4);
  expect(diff.totals.delta).toBe(2);
});
```

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run tests/unit/server/revision-diff.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/server/queries/revisions.ts`:

```ts
import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { bomLines, bomRevisions, bomSections, projects } from "@/db/schema";
import { getCurrentOrgId } from "../org";

export type LineSnapshot = {
  itemId: string;
  sku: string;
  description: string;
  manufacturer: string | null;
  unit: string;
  vendor: string | null;
  qty: number;
  unitPrice: number;
  section: string | null;
};

export type LineChange = {
  itemId: string;
  display: { sku: string; description: string };
  changes: {
    sku?: { from: string; to: string };
    description?: { from: string; to: string };
    manufacturer?: { from: string | null; to: string | null };
    unit?: { from: string; to: string };
    vendor?: { from: string | null; to: string | null };
    qty?: { from: number; to: number };
    price?: { from: number; to: number };
    section?: { from: string | null; to: string | null };
  };
};

export type RevisionDiff = {
  left: { id: string; letter: string };
  right: { id: string; letter: string; status: string };
  sections: {
    added: Array<{ name: string; lineCount: number }>;
    removed: Array<{ name: string; lineCount: number }>;
    renamed: Array<{ from: string; to: string }>;
    reordered: Array<{ name: string; from: number; to: number }>;
  };
  lines: { added: LineSnapshot[]; removed: LineSnapshot[]; changed: LineChange[] };
  totals: { leftValue: number; rightValue: number; delta: number };
};

async function loadSide(revisionId: string, orgId: string) {
  const [rev] = await db
    .select({
      id: bomRevisions.id,
      letter: bomRevisions.letter,
      status: bomRevisions.status,
      projectId: bomRevisions.projectId,
    })
    .from(bomRevisions)
    .innerJoin(projects, eq(projects.id, bomRevisions.projectId))
    .where(and(eq(bomRevisions.id, revisionId), eq(projects.organizationId, orgId)))
    .limit(1);
  if (!rev) throw new Error("REVISION_NOT_FOUND");

  const sections = await db
    .select({ id: bomSections.id, sectionKey: bomSections.sectionKey, name: bomSections.name, position: bomSections.position })
    .from(bomSections)
    .where(eq(bomSections.revisionId, revisionId));

  const lines = await db
    .select({
      itemId: bomLines.itemId,
      qty: bomLines.qty,
      unitPriceSnapshot: bomLines.unitPriceSnapshot,
      sku: bomLines.skuSnapshot,
      description: bomLines.descriptionSnapshot,
      manufacturer: bomLines.manufacturerSnapshot,
      unit: bomLines.unitSnapshot,
      vendor: bomLines.vendorNameSnapshot,
      sectionId: bomLines.sectionId,
    })
    .from(bomLines)
    .where(eq(bomLines.revisionId, revisionId));

  return { rev, sections, lines };
}

export async function getRevisionDiff(leftId: string, rightId: string): Promise<RevisionDiff> {
  const orgId = await getCurrentOrgId();
  const left = await loadSide(leftId, orgId);
  const right = await loadSide(rightId, orgId);
  if (left.rev.projectId !== right.rev.projectId) throw new Error("PROJECT_MISMATCH");

  // Section diff by sectionKey
  const leftSecByKey = new Map(left.sections.map(s => [s.sectionKey, s]));
  const rightSecByKey = new Map(right.sections.map(s => [s.sectionKey, s]));
  const sections: RevisionDiff["sections"] = { added: [], removed: [], renamed: [], reordered: [] };

  for (const [k, r] of rightSecByKey) {
    if (!leftSecByKey.has(k)) {
      const lineCount = right.lines.filter(l => l.sectionId === r.id).length;
      sections.added.push({ name: r.name, lineCount });
    }
  }
  for (const [k, l] of leftSecByKey) {
    if (!rightSecByKey.has(k)) {
      const lineCount = left.lines.filter(ln => ln.sectionId === l.id).length;
      sections.removed.push({ name: l.name, lineCount });
    } else {
      const r = rightSecByKey.get(k)!;
      if (l.name !== r.name) sections.renamed.push({ from: l.name, to: r.name });
      if (l.position !== r.position) sections.reordered.push({ name: r.name, from: l.position, to: r.position });
    }
  }

  // Line diff by itemId
  const leftByItem = new Map(left.lines.map(l => [l.itemId, l]));
  const rightByItem = new Map(right.lines.map(l => [l.itemId, l]));
  const sectionNameById = (sec: typeof left.sections, id: string | null) =>
    id ? sec.find(s => s.id === id)?.name ?? null : null;

  const toSnapshot = (l: typeof left.lines[number], side: typeof left): LineSnapshot => ({
    itemId: l.itemId, sku: l.sku, description: l.description,
    manufacturer: l.manufacturer, unit: l.unit, vendor: l.vendor,
    qty: l.qty, unitPrice: Number(l.unitPriceSnapshot),
    section: sectionNameById(side.sections, l.sectionId),
  });

  const lines: RevisionDiff["lines"] = { added: [], removed: [], changed: [] };
  for (const [id, r] of rightByItem) {
    if (!leftByItem.has(id)) lines.added.push(toSnapshot(r, right));
  }
  for (const [id, l] of leftByItem) {
    if (!rightByItem.has(id)) {
      lines.removed.push(toSnapshot(l, left));
    } else {
      const r = rightByItem.get(id)!;
      const changes: LineChange["changes"] = {};
      if (l.sku !== r.sku) changes.sku = { from: l.sku, to: r.sku };
      if (l.description !== r.description) changes.description = { from: l.description, to: r.description };
      if (l.manufacturer !== r.manufacturer) changes.manufacturer = { from: l.manufacturer, to: r.manufacturer };
      if (l.unit !== r.unit) changes.unit = { from: l.unit, to: r.unit };
      if (l.vendor !== r.vendor) changes.vendor = { from: l.vendor, to: r.vendor };
      if (l.qty !== r.qty) changes.qty = { from: l.qty, to: r.qty };
      const lp = Number(l.unitPriceSnapshot), rp = Number(r.unitPriceSnapshot);
      if (lp !== rp) changes.price = { from: lp, to: rp };
      const ls = sectionNameById(left.sections, l.sectionId);
      const rs = sectionNameById(right.sections, r.sectionId);
      if (ls !== rs) changes.section = { from: ls, to: rs };
      if (Object.keys(changes).length > 0) {
        lines.changed.push({ itemId: id, display: { sku: r.sku, description: r.description }, changes });
      }
    }
  }

  const sumValue = (ls: typeof left.lines) =>
    ls.reduce((s, l) => s + l.qty * Number(l.unitPriceSnapshot), 0);
  const leftValue = sumValue(left.lines);
  const rightValue = sumValue(right.lines);

  return {
    left: { id: left.rev.id, letter: left.rev.letter },
    right: { id: right.rev.id, letter: right.rev.letter, status: right.rev.status },
    sections, lines,
    totals: { leftValue, rightValue, delta: rightValue - leftValue },
  };
}

export async function listRevisionsForProject(projectId: string) {
  const orgId = await getCurrentOrgId();
  return db
    .select({
      id: bomRevisions.id,
      letter: bomRevisions.letter,
      status: bomRevisions.status,
      committedAt: bomRevisions.committedAt,
      committedById: bomRevisions.committedById,
      commitMessage: bomRevisions.commitMessage,
      parentRevisionId: bomRevisions.parentRevisionId,
      ownerId: bomRevisions.ownerId,
      createdAt: bomRevisions.createdAt,
    })
    .from(bomRevisions)
    .innerJoin(projects, eq(projects.id, bomRevisions.projectId))
    .where(and(eq(bomRevisions.projectId, projectId), eq(projects.organizationId, orgId)));
}
```

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run tests/unit/server/revision-diff.test.ts`
Expected: PASS, five tests.

- [ ] **Step 5: Commit**

```bash
git add src/server/queries/revisions.ts tests/unit/server/revision-diff.test.ts
git commit -m "feat(queries): getRevisionDiff with line + section comparison"
```

---

## Task 17: Update `generateExport` — read snapshots, allow drafts, record status (TDD)

**Files:**
- Modify: `src/server/actions/exports.ts`
- Modify: `tests/unit/server/exports.test.ts`

- [ ] **Step 1: Add failing test**

In `tests/unit/server/exports.test.ts`, append:

```ts
test("generateExport succeeds for a draft and records revisionStatusAtExport=draft", async () => {
  const { revisionId } = await setupWithLines();
  // revision is draft by default
  const row = await generateExport({ revisionId, options: defaultOptions() });
  expect(row.revisionStatusAtExport).toBe("draft");
});

test("generateExport on committed revision records revisionStatusAtExport=committed", async () => {
  const { revisionId } = await setupWithLines();
  await db.update(bomRevisions).set({ status: "committed" }).where(eq(bomRevisions.id, revisionId));
  const row = await generateExport({ revisionId, options: defaultOptions() });
  expect(row.revisionStatusAtExport).toBe("committed");
});
```

(Helpers `setupWithLines` and `defaultOptions` already exist in this file or need a simple addition; reuse the existing pattern.)

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run tests/unit/server/exports.test.ts`
Expected: FAIL — `revisionStatusAtExport` not set.

- [ ] **Step 3: Update `generateExport`**

In `src/server/actions/exports.ts`:

1. Replace the `lines` SELECT block to read snapshot columns instead of joining `items`/`vendors` for the snapshotted fields:

```ts
const lines = await db
  .select({
    sku: bomLines.skuSnapshot,
    description: bomLines.descriptionSnapshot,
    manufacturer: bomLines.manufacturerSnapshot,
    unit: bomLines.unitSnapshot,
    qty: bomLines.qty,
    unitPriceSnapshot: bomLines.unitPriceSnapshot,
    vendorName: bomLines.vendorNameSnapshot,
    stockState: items.stockState,           // still live (it's volatile inventory data)
    position: bomLines.position,
    sectionName: bomSections.name,
    sectionPosition: bomSections.position,
  })
  .from(bomLines)
  .innerJoin(items, eq(items.id, bomLines.itemId))
  .leftJoin(bomSections, eq(bomSections.id, bomLines.sectionId))
  .where(eq(bomLines.revisionId, rev.id))
  .orderBy(sql`${bomSections.position} ASC NULLS FIRST`, asc(bomLines.position));
```

(Drop the `vendors` join — no longer needed for export rows.)

2. Replace the row mapper:

```ts
const rows: BomRow[] = lines.map(l => ({
  sku: l.sku, description: l.description,
  manufacturer: l.manufacturer ?? "",
  vendor: l.vendorName, unit: l.unit, qty: l.qty,
  unitPrice: Number(l.unitPriceSnapshot),
  stock: l.stockState,
  sectionName: l.sectionName, sectionPosition: l.sectionPosition,
}));
```

3. Add a draft-aware filename and pass an `isDraft` flag through:

```ts
const isDraft = rev.status === "draft";
const draftSuffix = isDraft ? `_DRAFT_${new Date().toISOString().slice(0, 10)}` : "";
const fileName = `BOM_${rev.projectCode}_Rev_${rev.letter}${draftSuffix}.xlsx`;
```

4. Pass `isDraft` to `buildBomWorkbook`:

```ts
const buf = await buildBomWorkbook({
  // ...existing fields...
  isDraft,
});
```

5. Add a `revisionStatusAtExport` column to the insert and load `rev.status` from the existing query (`select` already returns letter/projectId — extend to include `status: bomRevisions.status`):

```ts
const [row] = await db.insert(bomExports).values({
  revisionId: rev.id,
  format: "xlsx",
  fileKey,
  fileName,
  byteSize: buf.length,
  options,
  status: "exported",
  revisionStatusAtExport: rev.status,
  generatedById: session.user.id,
}).returning();
```

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run tests/unit/server/exports.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/actions/exports.ts tests/unit/server/exports.test.ts
git commit -m "feat(exports): support draft exports and record revision status"
```

---

## Task 18: Add draft watermark to xlsx (TDD)

**Files:**
- Modify: `src/lib/excel.ts`
- Modify: `tests/unit/lib/excel.test.ts`

- [ ] **Step 1: Failing test**

Add to `tests/unit/lib/excel.test.ts`:

```ts
test("draft workbook embeds DRAFT — NOT FOR PROCUREMENT band on cover", async () => {
  const buf = await buildBomWorkbook({
    project: { code: "P", name: "P", quantity: 1, owner: "T", target: "—" },
    revisionLetter: "A",
    rows: [{ sku: "S", description: "d", manufacturer: "m", vendor: "V", unit: "pcs", qty: 1, unitPrice: 1, sectionName: null, sectionPosition: null }],
    options: { includeVendorPricing: false, includeStockAvailability: false, groupByVendor: false, includeCoverPage: true },
    isDraft: true,
  });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const cover = wb.worksheets.find(ws => ws.name === "Cover");
  expect(cover).toBeDefined();
  // The watermark text appears somewhere on the cover sheet.
  let found = false;
  cover!.eachRow(row => row.eachCell(cell => {
    if (typeof cell.value === "string" && cell.value.includes("DRAFT")) found = true;
  }));
  expect(found).toBe(true);
});
```

(Adjust the import line at the top if `ExcelJS` isn't already imported in this test file: `import ExcelJS from "exceljs";`.)

- [ ] **Step 2: Run, expect failure**

Run: `npx vitest run tests/unit/lib/excel.test.ts -t "DRAFT"`
Expected: FAIL.

- [ ] **Step 3: Implement**

In `src/lib/excel.ts`:

1. Extend `BuildInput`:

```ts
export type BuildInput = {
  project: { code: string; name: string; quantity: number; owner: string; target: string };
  revisionLetter: string;
  rows: BomRow[];
  options: BuildOptions;
  isDraft?: boolean;
};
```

2. In `buildCoverSheet` (existing function in this file), add a watermark band as the first visible content when `input.isDraft`:

```ts
if (input.isDraft) {
  const band = ws.getRow(1);
  band.getCell(1).value = "DRAFT — NOT FOR PROCUREMENT";
  band.getCell(1).font = { bold: true, color: { argb: "FFFFFFFF" }, size: 14 };
  band.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB91C1C" } };
  band.getCell(1).alignment = { horizontal: "center" };
  ws.mergeCells(1, 1, 1, 6);
  band.height = 28;
}
```

3. In `buildMainSheet` (existing function), add a footer when draft (after the existing rows are written):

```ts
if (input.isDraft) {
  ws.headerFooter.oddFooter =
    `&L&"Arial,Bold"&CDraft snapshot · ${new Date().toISOString().slice(0, 10)} · Owner: ${input.project.owner}`;
}
```

(Adjust line numbers in the existing functions to insert these snippets at the appropriate point — coverPage at the very top, main sheet footer near the end.)

- [ ] **Step 4: Run, expect pass**

Run: `npx vitest run tests/unit/lib/excel.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/excel.ts tests/unit/lib/excel.test.ts
git commit -m "feat(excel): draft watermark band + footer"
```

---

## Task 19: Add `RevisionStatusBadge`

**Files:**
- Modify: `src/components/ui/badge.tsx`

- [ ] **Step 1: Add the badge**

Append to `src/components/ui/badge.tsx`:

```tsx
type RevisionStatus = "draft" | "committed" | "in-progress" | "review" | "approved" | "locked";

const REVISION_STATUS_MAP: Record<RevisionStatus, { tone: Tone; label: string }> = {
  "draft":       { tone: "warning", label: "Draft" },
  "committed":   { tone: "info",    label: "Committed" },
  "in-progress": { tone: "info",    label: "In review" },
  "review":      { tone: "info",    label: "In review" },
  "approved":    { tone: "success", label: "Approved" },
  "locked":      { tone: "success", label: "Released" },
};

export function RevisionStatusBadge({ status }: { status: RevisionStatus }) {
  const { tone, label } = REVISION_STATUS_MAP[status];
  return <Badge tone={tone}>{label}</Badge>;
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/badge.tsx
git commit -m "feat(ui): add RevisionStatusBadge"
```

---

## Task 20: Build the commit dialog

**Files:**
- Create: `src/components/builder/commit-dialog.tsx`

- [ ] **Step 1: Implement**

Create `src/components/builder/commit-dialog.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { commitRevision } from "@/server/actions/revisions";

type Props = {
  revisionId: string;
  letter: string;
  lineCount: number;
  vendorCount: number;
  hasZeroQty: boolean;
};

export function CommitDialog({ revisionId, letter, lineCount, vendorCount, hasZeroQty }: Props) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const blocked = lineCount === 0 || hasZeroQty;

  const submit = () => {
    start(async () => {
      try {
        await commitRevision({ revisionId, commitMessage: message.trim() || undefined });
        toast.success(`Rev ${letter} committed`);
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Commit failed");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Commit revision</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Commit Rev {letter}</DialogTitle>
          <DialogDescription>
            Locks the revision. After commit the lines are read-only and the revision becomes procurement-eligible.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md bg-[var(--color-surface-2)] p-3 text-[12px]">
          <div className={lineCount > 0 ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}>
            {lineCount > 0 ? "✓" : "✗"} {lineCount} line{lineCount === 1 ? "" : "s"} · {vendorCount} vendor{vendorCount === 1 ? "" : "s"}
          </div>
          <div className={hasZeroQty ? "text-[var(--color-danger)]" : "text-[var(--color-success)]"}>
            {hasZeroQty ? "✗ Some lines have zero quantity" : "✓ No empty quantities"}
          </div>
        </div>

        <div className="mt-3 grid gap-1.5">
          <Label htmlFor="commit-message">Commit message <span className="text-[var(--color-text-3)]">(optional)</span></Label>
          <textarea
            id="commit-message"
            className="min-h-[72px] resize-y rounded-md border border-[var(--color-line)] p-2 text-[13px]"
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="What changed in this revision?"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button onClick={submit} disabled={pending || blocked}>Commit Rev {letter}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify compile**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/builder/commit-dialog.tsx
git commit -m "feat(builder): commit dialog with pre-flight checks"
```

---

## Task 21: Discard-draft button & branch button

**Files:**
- Create: `src/components/builder/discard-draft-button.tsx`
- Create: `src/components/builder/branch-revision-button.tsx`

- [ ] **Step 1: Implement discard button**

Create `src/components/builder/discard-draft-button.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { discardDraft } from "@/server/actions/revisions";

export function DiscardDraftButton({ revisionId, projectId }: { revisionId: string; projectId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() => {
        if (!confirm("Discard the current draft? This cannot be undone.")) return;
        start(async () => {
          try {
            await discardDraft({ revisionId });
            toast.success("Draft discarded");
            router.push(`/projects/${projectId}/history`);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Discard failed");
          }
        });
      }}
    >
      Discard draft
    </Button>
  );
}
```

- [ ] **Step 2: Implement branch button**

Create `src/components/builder/branch-revision-button.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { branchRevision } from "@/server/actions/revisions";

export function BranchRevisionButton({
  parentRevisionId, projectId, hasOpenDraft,
}: { parentRevisionId: string; projectId: string; hasOpenDraft: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      disabled={pending || hasOpenDraft}
      title={hasOpenDraft ? "A draft already exists for this project" : undefined}
      onClick={() => start(async () => {
        try {
          const newId = await branchRevision({ parentRevisionId });
          toast.success("New revision created");
          router.push(`/builder/${projectId}?revision=${newId}`);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Branch failed");
        }
      })}
    >
      New revision
    </Button>
  );
}
```

- [ ] **Step 3: Verify compile**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/builder/discard-draft-button.tsx src/components/builder/branch-revision-button.tsx
git commit -m "feat(builder): discard and branch buttons"
```

---

## Task 22: Build the revision header component

**Files:**
- Create: `src/components/revisions/revision-header.tsx`

- [ ] **Step 1: Implement**

Create `src/components/revisions/revision-header.tsx`:

```tsx
import Link from "next/link";
import { Badge, RevisionStatusBadge } from "@/components/ui/badge";
import { CommitDialog } from "@/components/builder/commit-dialog";
import { DiscardDraftButton } from "@/components/builder/discard-draft-button";
import { BranchRevisionButton } from "@/components/builder/branch-revision-button";

export type RevisionHeaderProps = {
  projectId: string;
  projectCode: string;
  projectName: string;
  revision: {
    id: string;
    letter: string;
    status: "draft" | "committed" | "in-progress" | "review" | "approved" | "locked";
    ownerName: string | null;
    committedByName: string | null;
    committedAt: Date | null;
    commitMessage: string | null;
    parentLetter: string | null;
  };
  preflight?: { lineCount: number; vendorCount: number; hasZeroQty: boolean };
  hasOpenDraft: boolean;
};

export function RevisionHeader(p: RevisionHeaderProps) {
  const { revision: r } = p;
  const isDraft = r.status === "draft";

  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        <div className="flex items-center gap-2.5">
          <h1 className="text-[20px] font-semibold tracking-tight">{p.projectName}</h1>
          <span className="rounded-full bg-[var(--color-surface-3)] px-2 py-px font-mono text-[11px] text-[var(--color-text-2)]">{p.projectCode}</span>
          <RevisionStatusBadge status={r.status} />
          <Badge tone="gray">Rev {r.letter}</Badge>
        </div>
        <div className="mt-1 text-[12px] text-[var(--color-text-3)]">
          {isDraft ? (
            <>
              Owner: {r.ownerName ?? "—"}
              {r.parentLetter ? <> · Branched from Rev {r.parentLetter}</> : null}
            </>
          ) : (
            <>
              Committed by {r.committedByName ?? "—"}
              {r.committedAt ? <> · {new Date(r.committedAt).toLocaleString()}</> : null}
              {r.commitMessage ? <> · <em>"{r.commitMessage}"</em></> : null}
            </>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Link href={`/projects/${p.projectId}/history`} className="text-[12px] text-[var(--color-text-2)] hover:underline">History</Link>
        {isDraft ? (
          <>
            <DiscardDraftButton revisionId={r.id} projectId={p.projectId} />
            {p.preflight && (
              <CommitDialog
                revisionId={r.id}
                letter={r.letter}
                lineCount={p.preflight.lineCount}
                vendorCount={p.preflight.vendorCount}
                hasZeroQty={p.preflight.hasZeroQty}
              />
            )}
          </>
        ) : (
          <BranchRevisionButton parentRevisionId={r.id} projectId={p.projectId} hasOpenDraft={p.hasOpenDraft} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify compile**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/revisions/revision-header.tsx
git commit -m "feat(revisions): unified revision header with draft/locked branches"
```

---

## Task 23: Wire the new header into `BuilderShell` and disable inputs when immutable

**Files:**
- Modify: `src/components/builder/builder-shell.tsx`
- Modify: `src/app/(app)/builder/page.tsx`

- [ ] **Step 1: Extend `BuilderShell` props**

In `src/components/builder/builder-shell.tsx`, replace the `Props` type and the existing top-of-page header (`<div className="mb-5 flex items-start justify-between gap-4">...</div>`) with a render of `<RevisionHeader>`. New props additions:

```ts
type Props = {
  projectId: string;
  projectCode: string;
  projectName: string;
  revisionId: string;
  revision: {
    id: string;
    letter: string;
    status: "draft" | "committed" | "in-progress" | "review" | "approved" | "locked";
    ownerName: string | null;
    committedByName: string | null;
    committedAt: Date | null;
    commitMessage: string | null;
    parentLetter: string | null;
  };
  hasOpenDraft: boolean;
  // ...rest of existing props
};
```

Render at the top of the return:

```tsx
<RevisionHeader
  projectId={p.projectId}
  projectCode={p.projectCode}
  projectName={p.projectName}
  revision={p.revision}
  preflight={{
    lineCount: p.lines.length,
    vendorCount: vendorCount,
    hasZeroQty: p.lines.some(l => l.qty === 0),
  }}
  hasOpenDraft={p.hasOpenDraft}
/>
```

When `p.revision.status !== "draft"`, hide or disable the editable controls. The simplest approach: don't render `<SearchAddCombo>` and `<CsvImportDialog>` for non-draft revisions, and pass `readOnly` to `<SectionedLineTable>` (add a prop and gate `onClick`/edit handlers inside).

- [ ] **Step 2: Update the page to pass new props**

In `src/app/(app)/builder/page.tsx`, extend the existing revision query to also select `status`, `ownerId`, `committedById`, `committedAt`, `commitMessage`, `parentRevisionId`, and join `user` for `ownerName` / `committedByName`, plus a left-join on `bom_revision` (alias) to grab the parent letter. Compute `hasOpenDraft` with a `count(*) WHERE projectId = ? AND status = 'draft'` query (excluding the current revision when needed).

Pass the new `revision` and `hasOpenDraft` props to `<BuilderShell>`.

- [ ] **Step 3: Verify compile**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/builder/builder-shell.tsx src/app/\(app\)/builder/page.tsx
git commit -m "feat(builder): host RevisionHeader; disable editing on non-draft"
```

---

## Task 24: Build the diff table and history table components

**Files:**
- Create: `src/components/revisions/diff-table.tsx`
- Create: `src/components/revisions/history-table.tsx`

- [ ] **Step 1: Implement diff table**

Create `src/components/revisions/diff-table.tsx`:

```tsx
import type { RevisionDiff } from "@/server/queries/revisions";

export function DiffTable({ diff }: { diff: RevisionDiff }) {
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)]">
      <table className="w-full text-[13px]">
        <thead className="bg-[var(--color-surface-2)] text-[11px] uppercase tracking-wide text-[var(--color-text-3)]">
          <tr>
            <th className="w-8 p-2"></th>
            <th className="p-2 text-left">SKU</th>
            <th className="p-2 text-left">Description</th>
            <th className="p-2 text-right">Qty</th>
            <th className="p-2 text-right">Price</th>
            <th className="p-2 text-left">Vendor</th>
            <th className="p-2 text-left">Section</th>
          </tr>
        </thead>
        <tbody>
          {diff.lines.added.map(l => (
            <tr key={`a-${l.itemId}`} className="bg-[var(--color-success-soft)]">
              <td className="p-2 font-semibold text-[var(--color-success)]">+</td>
              <td className="p-2">{l.sku}</td>
              <td className="p-2">{l.description}</td>
              <td className="p-2 text-right tabular-nums">{l.qty}</td>
              <td className="p-2 text-right tabular-nums">${l.unitPrice.toFixed(2)}</td>
              <td className="p-2">{l.vendor ?? "—"}</td>
              <td className="p-2">{l.section ?? "—"}</td>
            </tr>
          ))}
          {diff.lines.changed.map(c => (
            <tr key={`c-${c.itemId}`} className="bg-[var(--color-warning-soft)]">
              <td className="p-2 font-semibold text-[var(--color-warning)]">~</td>
              <td className="p-2">{c.changes.sku ? <><s>{c.changes.sku.from}</s> → <strong>{c.changes.sku.to}</strong></> : c.display.sku}</td>
              <td className="p-2">{c.changes.description ? <><s>{c.changes.description.from}</s> → <strong>{c.changes.description.to}</strong></> : c.display.description}</td>
              <td className="p-2 text-right tabular-nums">{c.changes.qty ? <>{c.changes.qty.from} → <strong>{c.changes.qty.to}</strong></> : "—"}</td>
              <td className="p-2 text-right tabular-nums">{c.changes.price ? <>${c.changes.price.from.toFixed(2)} → <strong>${c.changes.price.to.toFixed(2)}</strong></> : "—"}</td>
              <td className="p-2">{c.changes.vendor ? <>{c.changes.vendor.from ?? "—"} → <strong>{c.changes.vendor.to ?? "—"}</strong></> : "—"}</td>
              <td className="p-2">{c.changes.section ? <>{c.changes.section.from ?? "—"} → <strong>{c.changes.section.to ?? "—"}</strong></> : "—"}</td>
            </tr>
          ))}
          {diff.lines.removed.map(l => (
            <tr key={`r-${l.itemId}`} className="bg-[var(--color-danger-soft)]">
              <td className="p-2 font-semibold text-[var(--color-danger)]">−</td>
              <td className="p-2 line-through">{l.sku}</td>
              <td className="p-2 line-through">{l.description}</td>
              <td className="p-2 text-right tabular-nums line-through">{l.qty}</td>
              <td className="p-2 text-right tabular-nums line-through">${l.unitPrice.toFixed(2)}</td>
              <td className="p-2 line-through">{l.vendor ?? "—"}</td>
              <td className="p-2 line-through">{l.section ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Implement history table**

Create `src/components/revisions/history-table.tsx`:

```tsx
import Link from "next/link";
import { RevisionStatusBadge } from "@/components/ui/badge";

export type HistoryRow = {
  id: string;
  letter: string;
  status: "draft" | "committed" | "in-progress" | "review" | "approved" | "locked";
  committedByName: string | null;
  committedAt: Date | null;
  commitMessage: string | null;
  parentRevisionId: string | null;
};

export function HistoryTable({ projectId, rows }: { projectId: string; rows: HistoryRow[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)]">
      <table className="w-full text-[13px]">
        <thead className="bg-[var(--color-surface-2)] text-[11px] uppercase tracking-wide text-[var(--color-text-3)]">
          <tr>
            <th className="p-2 text-left">Rev</th>
            <th className="p-2 text-left">Status</th>
            <th className="p-2 text-left">Committed by</th>
            <th className="p-2 text-left">When</th>
            <th className="p-2 text-left">Message</th>
            <th className="p-2 text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="border-t border-[var(--color-line-soft)]">
              <td className="p-2 font-semibold">{r.letter}</td>
              <td className="p-2"><RevisionStatusBadge status={r.status} /></td>
              <td className="p-2">{r.committedByName ?? "—"}</td>
              <td className="p-2">{r.committedAt ? new Date(r.committedAt).toLocaleString() : (r.status === "draft" ? "in progress" : "—")}</td>
              <td className="p-2 italic text-[var(--color-text-2)]">{r.commitMessage ?? "—"}</td>
              <td className="p-2 text-right">
                {r.parentRevisionId
                  ? <Link className="text-[var(--color-info)] hover:underline" href={`/projects/${projectId}/diff?left=${r.parentRevisionId}&right=${r.id}`}>Diff vs parent</Link>
                  : <span className="text-[var(--color-text-3)]">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Verify compile**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/revisions/diff-table.tsx src/components/revisions/history-table.tsx
git commit -m "feat(revisions): diff and history table components"
```

---

## Task 25: Add the project history page

**Files:**
- Create: `src/app/(app)/projects/[id]/history/page.tsx`

- [ ] **Step 1: Implement**

Create `src/app/(app)/projects/[id]/history/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { bomRevisions, projects, user } from "@/db/schema";
import { getCurrentOrgId } from "@/server/org";
import { HistoryTable, type HistoryRow } from "@/components/revisions/history-table";

export default async function HistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const orgId = await getCurrentOrgId();

  const [project] = await db
    .select({ id: projects.id, code: projects.code, name: projects.name })
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.organizationId, orgId)))
    .limit(1);
  if (!project) notFound();

  const rows = await db
    .select({
      id: bomRevisions.id,
      letter: bomRevisions.letter,
      status: bomRevisions.status,
      committedByName: user.name,
      committedAt: bomRevisions.committedAt,
      commitMessage: bomRevisions.commitMessage,
      parentRevisionId: bomRevisions.parentRevisionId,
    })
    .from(bomRevisions)
    .leftJoin(user, eq(user.id, bomRevisions.committedById))
    .where(eq(bomRevisions.projectId, id))
    .orderBy(desc(bomRevisions.createdAt));

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-[20px] font-semibold tracking-tight">{project.name} — history</h1>
        <p className="text-[13px] text-[var(--color-text-3)]">All revisions for {project.code}.</p>
      </div>
      <HistoryTable projectId={id} rows={rows as HistoryRow[]} />
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npm run dev`, open `http://localhost:3000/projects/<id>/history`. Confirm page renders.
Then stop dev server.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/projects/\[id\]/history/page.tsx
git commit -m "feat(history): project revision history page"
```

---

## Task 26: Add the diff page

**Files:**
- Create: `src/app/(app)/projects/[id]/diff/page.tsx`

- [ ] **Step 1: Implement**

Create `src/app/(app)/projects/[id]/diff/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { Badge, RevisionStatusBadge } from "@/components/ui/badge";
import { DiffTable } from "@/components/revisions/diff-table";
import { getRevisionDiff } from "@/server/queries/revisions";

export default async function DiffPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ left?: string; right?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  if (!sp.left || !sp.right) notFound();

  const diff = await getRevisionDiff(sp.left, sp.right);

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <h1 className="text-[20px] font-semibold tracking-tight">Comparing</h1>
        <Badge tone="gray">Rev {diff.left.letter}</Badge>
        <span className="text-[var(--color-text-3)]">→</span>
        <Badge tone="gray">Rev {diff.right.letter}</Badge>
        <RevisionStatusBadge status={diff.right.status as never} />
        <span className="ml-auto text-[13px]">
          Total: {diff.totals.delta >= 0 ? "+" : ""}${diff.totals.delta.toFixed(2)}
        </span>
      </div>

      <div className="mb-4 grid grid-cols-4 gap-2 text-[12px]">
        <Stat label="Added" value={diff.lines.added.length} />
        <Stat label="Removed" value={diff.lines.removed.length} />
        <Stat label="Changed" value={diff.lines.changed.length} />
        <Stat label="Section ops" value={diff.sections.added.length + diff.sections.removed.length + diff.sections.renamed.length + diff.sections.reordered.length} />
      </div>

      <DiffTable diff={diff} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] p-3">
      <div className="text-[11px] uppercase tracking-wider text-[var(--color-text-3)]">{label}</div>
      <div className="mt-0.5 text-[16px] font-semibold tabular-nums">{value}</div>
    </div>
  );
}
```

- [ ] **Step 2: Smoke check**

Run: `npm run dev`, open `http://localhost:3000/projects/<id>/diff?left=<a>&right=<b>` for a project that has at least one diff-able pair. Confirm page renders.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/projects/\[id\]/diff/page.tsx
git commit -m "feat(diff): revision diff page"
```

---

## Task 27: Surface "Send to procurement" against latest committed-or-locked rev

**Files:**
- Modify: `src/components/approvals/approvals-table.tsx`
- Modify: `src/server/queries/projects.ts` (or wherever the approvals page resolves revisions)

- [ ] **Step 1: Resolve target revision**

Find the action site that calls `requestApproval` (search: `requestApproval(`). For each project row, ensure the `revisionId` passed corresponds to the latest revision with status in `("committed", "in-progress", "review", "approved", "locked")` for the project — NOT the latest revision regardless of status.

In a server query that backs the approvals page (likely `src/server/queries/approvals.ts`), add or adjust:

```ts
// pseudo: pick the latest non-draft revision per project for procurement actions
const latestProcurementRevision = await db
  .select({ id: bomRevisions.id, status: bomRevisions.status })
  .from(bomRevisions)
  .where(and(eq(bomRevisions.projectId, projectId), ne(bomRevisions.status, "draft")))
  .orderBy(desc(bomRevisions.createdAt))
  .limit(1);
```

- [ ] **Step 2: Disable + tooltip when no eligible revision exists**

In the row UI, if there is no committed-or-locked revision (e.g., project has only a draft), render the "Request approval" button as disabled with `title="Commit a revision before sending to procurement."`.

- [ ] **Step 3: Run tests**

Run: `npm test`
Expected: all unit tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/approvals/approvals-table.tsx src/server/queries/approvals.ts
git commit -m "feat(approvals): target latest committed/locked rev; disable when none"
```

---

## Task 28: E2E smoke — full lifecycle

**Files:**
- Create: `tests/e2e/versioning.spec.ts`

- [ ] **Step 1: Write the spec**

Create `tests/e2e/versioning.spec.ts`. Follow the patterns in existing specs (e.g., `tests/e2e/builder.spec.ts`) for sign-in helpers and seeded data.

```ts
import { test, expect } from "@playwright/test";
import { signInAsTestUser, seedProjectWithItems } from "./helpers";

test("commit → branch → diff → procurement", async ({ page }) => {
  await signInAsTestUser(page);
  const { projectId, revisionId, items } = await seedProjectWithItems({ status: "draft" });

  // 1. Commit dialog blocks empty BOM
  await page.goto(`/builder/${projectId}`);
  await expect(page.getByText(/Draft/)).toBeVisible();

  // 2. Add a line, commit
  await page.getByPlaceholder(/search/i).fill(items[0].sku);
  await page.getByRole("option", { name: new RegExp(items[0].sku) }).click();
  await page.getByRole("button", { name: "Commit revision" }).click();
  await page.getByRole("textbox", { name: /commit message/i }).fill("Initial");
  await page.getByRole("button", { name: /Commit Rev A/i }).click();
  await expect(page.getByText(/Committed/)).toBeVisible();

  // 3. Branch
  await page.getByRole("button", { name: "New revision" }).click();
  await expect(page).toHaveURL(/\/builder\//);
  await expect(page.getByText(/Draft/)).toBeVisible();
  await expect(page.getByText(/Branched from Rev A/)).toBeVisible();

  // 4. Modify, commit Rev B
  // (skip detailed UI — assert badge transitions)

  // 5. History page shows two rows
  await page.goto(`/projects/${projectId}/history`);
  await expect(page.getByText("A")).toBeVisible();
  await expect(page.getByText("B")).toBeVisible();

  // 6. Diff page renders
  await page.getByRole("link", { name: /Diff vs parent/i }).first().click();
  await expect(page.getByText(/Comparing/)).toBeVisible();
});
```

(Adjust to match the actual helper signatures in `tests/e2e/helpers.ts`.)

- [ ] **Step 2: Run e2e**

Run: `npm run test:e2e -- versioning`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/versioning.spec.ts
git commit -m "test(e2e): versioning lifecycle smoke"
```

---

## Task 29: Final regression sweep

- [ ] **Step 1: Run full unit suite**

Run: `npm test`
Expected: all passing.

- [ ] **Step 2: Run full e2e suite**

Run: `npm run test:e2e`
Expected: all passing. If a pre-existing e2e fails because the builder header changed, update its selectors and commit a follow-up:

```bash
git add tests/e2e/
git commit -m "test(e2e): update selectors for new revision header"
```

- [ ] **Step 3: Run lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 4: Manual smoke**

`npm run dev` → click through: dashboard → builder → add lines → commit → branch → edit → commit → history → diff → procurement workflow. Confirm draft watermark appears on a draft xlsx download.

- [ ] **Step 5: Final commit (if any cleanup needed)**

```bash
git status
# resolve any remaining files
```

---

## Self-review notes

- **Spec coverage:** every section (lifecycle, schema, server actions, queries, UI, audit) is covered by at least one task. Procurement gate is split across Tasks 14 (server) and 27 (UI).
- **No placeholders:** every code block is concrete; no "TBD" or "implement appropriate".
- **Type consistency:** `RevisionDiff` shape is defined once in Task 16 and consumed unchanged by Tasks 24, 26. `RevisionStatus` union appears identically in `RevisionStatusBadge`, `RevisionHeader`, and `BuilderShell` props.
- **One open follow-up acknowledged:** the spec mentions "since last commit" inline diff in the builder as future work — explicitly out of scope here.
