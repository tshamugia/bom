<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Single-tenant, no public sign-up

Public registration is intentionally disabled and the app is single-tenant — there is no `organizations` or `memberships` table, and `getCurrentOrgId` does not exist. Users are created from `/users` by an owner/admin; authorization is driven by `user.role`. Do not reintroduce a sign-up page or an `organizationId` column. See `CLAUDE.md` § Single-tenant access control for the canonical pattern.
