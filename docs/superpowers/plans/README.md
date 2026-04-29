# BOM Studio — Implementation Plans

Six sequential plans build BOM Studio end-to-end. Each plan produces working,
testable software on its own, and depends only on the plans before it.

| #  | Plan | Outputs |
|----|------|---------|
| 01 | [Foundation](./2026-04-30-01-foundation.md) | Next.js 15 + TS + Tailwind v4 + shadcn + Drizzle + Postgres + better-auth + S3 client + sidebar/topbar shell + auth pages |
| 02 | [Master Data](./2026-04-30-02-master-data.md) | Vendors, Categories, Items schema · Catalog page · Vendors page · seed from sample design |
| 03 | [BOM Builder](./2026-04-30-03-bom-builder.md) | Projects, Revisions, Lines schema · Builder page (filters, search-add, qty edit, columns, layout, CSV import) |
| 04 | [Preview & Generate](./2026-04-30-04-preview-generate.md) | exceljs export · S3 upload + presigned download · Preview page · Generate dialog · History page |
| 05 | [Approvals](./2026-04-30-05-approvals.md) | Workflows + steps schema · Approvals page (4 tabs) · Send-for-review · live ApproversCard · workflow-driven status badges |
| 06 | [Dashboard](./2026-04-30-06-dashboard.md) | audit_log + audit() helper · KPI tiles · live projects table · activity timeline · stock alerts · CSV report export |

## How to execute

Each plan opens with a header pointing to the **subagent-driven-development**
skill (recommended) or **executing-plans** skill. Use one. Steps inside each
task use `- [ ]` checkboxes so progress is trackable.

## Defaults locked at planning time

- Single-organization tenancy with `organizationId` on every domain table (multi-tenant later is a migration, not a rewrite)
- better-auth: email + password and magic link
- Drizzle ORM with `postgres-js` driver
- exceljs for `.xlsx`
- AWS S3 (or MinIO locally — see Plan 04 task 10)
- Vitest + Playwright
