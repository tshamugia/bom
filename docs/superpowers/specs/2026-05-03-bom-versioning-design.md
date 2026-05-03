# BOM versioning & change tracking — design

**Status:** Draft for review
**Date:** 2026-05-03
**Author:** Tengo Shamugia (with Claude)

## Problem

Today, edits inside a BOM are not tracked. There is no way to answer "who changed this and when" or to see what changed between two procurement-ready versions. The existing `bom_revision` table has the right shape (per-revision rows with `letter`, `status`, `lockedAt`) but the lifecycle is not actually used as a versioning gate, and lines reference live `item` data so historical revisions silently mutate when items are renamed or repriced.

Procurement teams also have no enforced gate: any revision can be sent downstream regardless of whether it has been declared "done."

## Goals

1. **Commit-style versioning.** Each procurement-ready version of a BOM is an immutable revision (Rev A, Rev B, …) with a known author, timestamp, and optional commit message.
2. **Stable diff across revisions.** Comparing two committed revisions shows exactly what changed in lines and sections, including attribute-level changes (qty, price, vendor, description, manufacturer, unit, section assignment, section rename/reorder).
3. **Procurement gate.** Only locked revisions can be submitted to procurement workflows. Drafts can still be downloaded for internal review but are visibly marked as drafts.
4. **Working-copy ergonomics.** Users can save and resume draft work without ceremony. No per-edit history is captured during draft work — only the commit boundary matters.

## Non-goals

- Per-edit (field-level) history within a draft. Drafts overwrite themselves; only commits are durable history.
- Three-way merge. Branching is linear (one parent per draft). No merge conflicts can exist.
- History or diff for non-BOM-line attributes (project metadata, item catalog edits). Those flow through `audit_log` separately.
- Permissions overhaul. Existing project edit permissions apply; commit is allowed for any user with edit access.

## Concepts and lifecycle

A `bom_revision` is the unit of versioning. The relevant states for this feature:

- **`draft`** — the working copy. Editable. Has an `ownerId` (the person responsible for completing it). Cannot be sent to procurement. Can be exported (with draft watermarking).
- **`committed`** — author has committed the revision. Immutable. Has `committedById`, `committedAt`, and a `commitMessage`. Diffable, exportable, procurement-eligible (can be submitted to an approval workflow).
- **`locked`** — terminal post-approval state already produced by `approveStep` when every approval stage approves. Immutable, diffable, exportable. (Not produced by the new commit action; we leave the existing approval-workflow semantics untouched.)

A new enum value `committed` is added to `revisionStatusEnum` between `draft` and the existing approval states. The intermediate values `in-progress`, `review`, `approved` remain for backward compatibility with the approval workflow.

**Immutability gate.** Wherever existing code blocks edits via `if (status === "locked")`, the check becomes `if (status === "committed" || status === "locked")`. We centralize this in a small helper to avoid drift.

**Procurement gate.** `requestApproval` currently requires `status !== "locked"`. It is changed to require `status === "committed"` (only committed revisions can be sent to procurement).

### Lifecycle

```
[ no revision ]
       │
       │ "New revision" (initial, no parent)
       ▼
   draft (Rev A)
       │
       │ commit (writes committedById, committedAt, commitMessage)
       ▼
  committed (Rev A) ─────────────────────► (procurement workflows: in-progress/review/approved/locked)
       │
       │ "New revision" (branch — copies sections + lines forward)
       ▼
   draft (Rev B, parentRevisionId=A)
       │
       │ commit
       ▼
  committed (Rev B)
       │
       ⋮
```

**Branching.** Creating a new draft from a committed (or locked) revision copies all `bom_section` rows and all `bom_line` rows, generating fresh ids. Snapshot fields on `bom_line` are **re-snapshotted from current `item.*` values** at branch time, so the new draft reflects today's catalog state. The diff against the parent revision will surface any deltas this introduces.

**One open draft per project.** A project may have at most one revision in `draft` status at any time. To start a new draft, the prior draft must be either committed or discarded. This keeps "the draft" unambiguous for users and procurement.

**No mutations to locked revisions.** Existing `REVISION_LOCKED` checks in `src/server/actions/bom-lines.ts` already enforce this for line mutations. The same check is added to all section actions in `src/server/actions/bom-sections.ts`.

## Schema changes

### `bom_revision` — new columns

| Column | Type | Notes |
|---|---|---|
| `ownerId` | `text` → `user.id`, on delete `set null` | Person responsible for the draft. Set to creator on insert; mutable. |
| `committedById` | `text` → `user.id`, on delete `set null` | Set on commit (the new author-driven action). |
| `committedAt` | `timestamp`, nullable | Set on commit. |
| `commitMessage` | `text`, nullable | Optional human-authored description for the commit. |
| `parentRevisionId` | `text` → `bom_revision.id`, on delete `set null` | Set when branching from a locked revision. Null for the first revision of a project. |

The existing `notes` field stays as freeform notes (decoupled from the commit message).

### `bom_line` — extended snapshot columns

Currently only `unitPriceSnapshot` is captured at insert. To make historical diffs stable, capture the rest of the procurement-relevant attributes from the source `item` row (and joined vendor) at insert and at branch time:

| Column | Sourced from |
|---|---|
| `skuSnapshot` | `item.sku` |
| `descriptionSnapshot` | `item.description` |
| `manufacturerSnapshot` | `item.manufacturer` |
| `unitSnapshot` | `item.unit` |
| `vendorNameSnapshot` | `vendor.name` (via `item.vendorId`) |

Volatile inventory data (`stockState`) and display-only fields (category, item notes) are intentionally not snapshotted.

### `bom_section` — new column

| Column | Type | Notes |
|---|---|---|
| `sectionKey` | `text`, not null | Stable identifier carried across revisions. Generated on creation; copied forward on branch. Diff matches sections by `sectionKey` so renames render as `renamed: from → to`, not `removed + added`. |

### `bom_export` — new column

| Column | Type | Notes |
|---|---|---|
| `revisionStatusAtExport` | `text`, not null | Denormalized snapshot of the revision's status at the moment of export. Distinguishes "Draft snapshot" exports from "Locked release" exports in the export history. |

### Migration

A single Drizzle migration adds the columns above and backfills:

- `bom_section.sectionKey` ← `bom_section.id` for existing rows (preserves identity for legacy data, even though no historical diff was previously possible).
- `bom_line.*Snapshot` ← join against current `item` / `vendor` for existing rows. Best-effort; existing revisions have never had stable historical diffs anyway.
- `bom_export.revisionStatusAtExport` ← `'locked'` for existing rows (assume historical exports were release-grade; flag in spec that this is a documented assumption).
- `bom_revision.ownerId` ← `project.ownerId` for existing rows.

## Server actions

### New: `commitRevision(revisionId, { commitMessage? })`

1. Authorize: caller must have edit access on the project.
2. Load revision; require `status === 'draft'`.
3. Validate: revision must have at least one line.
4. Update: `status = 'committed'`, `committedById = currentUser.id`, `committedAt = now()`, `commitMessage = input.commitMessage ?? null`.
5. `audit({ kind: 'bom.revision.committed', refType: 'project', refId: projectId, payload: { revisionId, letter, commitMessage } })`.
6. Revalidate `/builder/[id]`, `/projects/[id]/history`, `/dashboard`.

### New: `branchRevision(parentRevisionId)`

1. Authorize and load parent; require `status === 'committed' || status === 'locked'`.
2. Reject if any draft already exists for the same project (one-open-draft rule).
3. Compute next letter (`A → B → C …` based on existing revisions for the project).
4. Insert new `bom_revision` with `status: 'draft'`, `parentRevisionId = parent.id`, `ownerId = currentUser.id`.
5. Copy sections (new ids, same `sectionKey`, same name/position).
6. Copy lines: new ids, fresh snapshots from current `item` + `vendor` rows; preserve `qty`, `position`, and the new `sectionId` mapping.
7. `audit({ kind: 'bom.revision.branched', refType: 'project', refId: projectId, payload: { parentRevisionId, newRevisionId, letter } })`.
8. Return the new revision id.

### New: `discardDraft(revisionId)`

Hard delete (cascade removes lines and sections). Only allowed if `status === 'draft'`. Audited.

### Updated: `addLine`, `updateLineQty`, `removeLine`, `moveLineToSection` (in `bom-lines.ts`)

- `addLine` is updated to capture the new snapshot fields (`sku`, `description`, `manufacturer`, `unit`, `vendor.name`) at insert time, mirroring how `unitPriceSnapshot` is already captured.
- No new audit calls (per design, drafts are not tracked at the edit level).
- Existing `REVISION_LOCKED` guards stay.

### Updated: section actions in `bom-sections.ts`

- `createSection` generates a fresh `sectionKey` (cuid).
- All mutations check `REVISION_LOCKED` (some currently miss this — defense-in-depth fix).

### Updated: `generateExport`

- Does **not** require the revision to be locked.
- Reads the new snapshot columns from `bom_line` (no longer joins live `item.sku`/`description`/etc., except for fields not in the snapshot — none in this design).
- Sets `bom_export.revisionStatusAtExport` to the current revision status.
- When `revisionStatusAtExport === 'draft'`, the workbook is generated with:
  - Filename suffix: `_DRAFT_{YYYY-MM-DD}`
  - A red header band on the cover page: "DRAFT — NOT FOR PROCUREMENT"
  - Footer on every sheet: `Draft snapshot · {timestamp} · Owner: {name}`

### Updated: approval workflow creation (procurement gate)

`requestApproval` in `src/server/actions/approvals.ts` currently rejects when `status === "locked"`. Replace that check with: `if (revision.status !== 'committed') throw new Error('REVISION_NOT_COMMITTED')`. Only committed revisions can be sent to procurement.

When a project's *latest* revision is a draft but a prior committed (or locked) revision exists, procurement actions in the UI target the **latest committed-or-locked revision** (Option α from brainstorming). Server actions accept an explicit `revisionId` so the UI can disambiguate.

### Updated: edit guards in `bom-lines.ts` and `bom-sections.ts`

The existing pattern `if (status === "locked") throw "REVISION_LOCKED"` is replaced by a single helper `isRevisionImmutable(status)` exported from `src/server/lib/revision-status.ts`:

```ts
export function isRevisionImmutable(status: RevisionStatus): boolean {
  return status === "committed" || status === "locked";
}
```

All five existing guards (in `bom-lines.ts` and `bom-sections.ts`) call this helper.

## Diff query

### Endpoint

`getRevisionDiff(leftRevisionId, rightRevisionId): Promise<RevisionDiff>` — new file `src/server/queries/revisions.ts`. Read-only. Both revisions must belong to the same project and the same org.

The right-hand revision may be a draft (so users can preview "what will Rev B look like vs Rev A" while still editing). The left-hand revision must be locked.

### Algorithm

1. Load sections + lines for both revisions in two queries.
2. Match sections across revisions by `sectionKey`.
3. Match lines across revisions by `itemId`.
4. Walk the matched sets:
   - In right not in left → `added`.
   - In left not in right → `removed`.
   - In both → check each tracked attribute; if any differ, push to `changed` with per-attribute `{ from, to }`.
5. Compute totals (`Σ qty × unitPriceSnapshot`) for each side; report delta.

### Output shape

```ts
type LineSnapshot = {
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

type LineChange = {
  itemId: string;
  display: { sku: string; description: string };   // right-side values for table display
  changes: {
    sku?:          { from: string; to: string };
    description?:  { from: string; to: string };
    manufacturer?: { from: string | null; to: string | null };
    unit?:         { from: string; to: string };
    vendor?:       { from: string | null; to: string | null };
    qty?:          { from: number; to: number };
    price?:        { from: number; to: number };
    section?:      { from: string | null; to: string | null };
  };
};

type RevisionDiff = {
  left:  { id: string; letter: string; lockedAt: Date | null };
  right: { id: string; letter: string; status: 'draft' | 'locked' };
  sections: {
    added:     Array<{ name: string; lineCount: number }>;
    removed:   Array<{ name: string; lineCount: number }>;
    renamed:   Array<{ from: string; to: string }>;
    reordered: Array<{ name: string; from: number; to: number }>;
  };
  lines: {
    added:   LineSnapshot[];
    removed: LineSnapshot[];
    changed: LineChange[];
  };
  totals: {
    leftValue:  number;
    rightValue: number;
    delta:      number;
  };
};
```

## UI

### Reusable badge — `RevisionStatusBadge`

Added to `src/components/ui/badge.tsx` alongside the existing `VendorStatusBadge` / `StockBadge`:

```tsx
RevisionStatusBadge: status='draft'       → tone="warning", label="Draft"
                     status='committed'   → tone="info",    label="Committed"
                     status='in-progress' → tone="info",    label="In review"
                     status='review'      → tone="info",    label="In review"
                     status='approved'    → tone="success", label="Approved"
                     status='locked'      → tone="success", label="Released"
```

The badge is shown wherever a revision identifier is rendered: builder header, dashboard rows, history list, diff view header.

### Builder header

- **Draft revision:** `{Project name} {Code} · [Draft · Rev B] · {owner avatar} {owner name} · Branched from Rev A · 2026-05-01`. Right side: "Discard draft", "Generate export", "Commit revision" (primary).
- **Committed/locked revision:** `{Project name} {Code} · [{status badge} · Rev A] · Committed by {name} · {timestamp} · "{commit message}"`. Right side: "Generate export", "Compare to…", "New revision" (primary; disabled if a draft already exists for the project).
- Committed-or-locked builder is fully read-only: existing edit handlers throw via `isRevisionImmutable`, but the UI also disables inputs so users don't discover the limit by error.

### Commit dialog — `src/components/builder/commit-dialog.tsx`

Modal triggered by "Commit revision" in the builder header.

Pre-flight summary (rendered from a quick server query):
- Line count, section count, distinct vendor count.
- ✓ / ✗ checks: at least one line; no zero-quantity lines; etc.
- If a parent revision exists, surface a count of changed/added/removed lines vs parent with a "review diff" link.

Form: optional `commitMessage` textarea. Primary button: "Commit Rev {letter}". Confirms `commitRevision` server action.

### Project history page — `src/app/(app)/projects/[id]/history/page.tsx`

Table of all revisions for the project, newest first:

| Column | Content |
|---|---|
| Rev | Letter |
| Status | `RevisionStatusBadge` |
| Committed by | Avatar + name (or "—" for drafts) |
| When | Locked timestamp (or "in progress" for drafts) |
| Message | `commitMessage` |
| Δ vs prev | Total value delta + line count summary |
| Action | "Diff vs {prev}" / "View export" |

### Diff page — `src/app/(app)/projects/[id]/diff/page.tsx?left=<id>&right=<id>`

- Header: "Comparing [Rev A] → [Rev B]" with badges, plus total-value delta.
- Section summary block: added / removed / renamed / reordered counts.
- Line table grouped by `+ added` (green), `~ changed` (amber), `− removed` (red). Changed cells render `from → to` inline. Sortable by SKU, by absolute price delta, by section.

### Procurement-action UI

- "Send to procurement" / "Request approval" buttons:
  - On a draft → disabled, tooltip: *"Commit this revision before sending to procurement."*
  - On a draft *with a prior committed/locked revision* → enabled, but the action targets the latest committed-or-locked revision; tooltip clarifies: *"Sending Rev A. Rev B is still in draft."*
- "Generate export" is always enabled. Watermarking (cover band, filename suffix, footer) is applied automatically when `revisionStatus === 'draft'`.

## Audit log additions

New `auditKindEnum` values:

- `bom.revision.committed` — payload: `{ revisionId, letter, commitMessage }`
- `bom.revision.branched` — payload: `{ parentRevisionId, newRevisionId, letter }`
- `bom.revision.discarded` — payload: `{ revisionId, letter }`
- `bom.export.generated` already exists; payload extended with `revisionStatusAtExport`.

## Testing

- **Unit:** `commitRevision` rejects empty BOMs, drafts only; `branchRevision` rejects when a draft already exists; `discardDraft` rejects on locked.
- **Unit:** `getRevisionDiff` handles every change kind (added / removed / changed line; added / removed / renamed / reordered section).
- **Integration:** branch → edit → commit → branch again → diff Rev A vs Rev C correctly shows the union of changes.
- **Integration:** procurement workflow creation rejects drafts; export generation succeeds for drafts and writes draft watermark to xlsx.
- **UI smoke (Playwright):** builder header switches correctly between draft and locked; commit dialog flow; history list links to diff; diff page renders all change kinds.

## Open follow-ups (out of scope here)

- Surface "since last commit" diff inline in the builder while editing (a different UX pattern; can be added later using the same `getRevisionDiff` endpoint with `right = current draft`).
- Allow the draft owner to be reassigned from the UI (currently mutable in DB but no UI affordance).
- Per-row history within a single draft (explicitly out of scope per brainstorming).
