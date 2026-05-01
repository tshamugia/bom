import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { projects, bomRevisions, bomLines, items, vendors, categories, subcategories } from "@/db/schema";
import { getCurrentOrgId } from "../org";

export async function listProjects() {
  const orgId = await getCurrentOrgId();
  // Pull each project's active (non-locked) revision's totals.
  return db.execute(sql/* sql */`
    SELECT
      p.id, p.code, p.name, p.status, p.updated_at AS "updatedAt", p.target_date AS "targetDate",
      COALESCE(stats.line_count, 0)::int AS "lineCount",
      COALESCE(stats.total, 0)::float    AS "total"
    FROM "project" p
    LEFT JOIN LATERAL (
      SELECT r.id, COUNT(l.*) AS line_count, COALESCE(SUM(l.qty * l.unit_price_snapshot), 0) AS total
      FROM "bom_revision" r
      LEFT JOIN "bom_line" l ON l.revision_id = r.id
      WHERE r.project_id = p.id AND r.status <> 'locked'
      GROUP BY r.id
      ORDER BY r.created_at DESC
      LIMIT 1
    ) stats ON TRUE
    WHERE p.organization_id = ${orgId}
    ORDER BY p.updated_at DESC
  `).then(r => r as unknown as Array<{
    id: string; code: string; name: string; status: string;
    updatedAt: Date; targetDate: string | null; lineCount: number; total: number;
  }>);
}

export async function getProject(id: string) {
  const orgId = await getCurrentOrgId();
  const [p] = await db.select().from(projects).where(and(eq(projects.id, id), eq(projects.organizationId, orgId))).limit(1);
  if (!p) return null;
  const [rev] = await db
    .select({ id: bomRevisions.id, letter: bomRevisions.letter, status: bomRevisions.status })
    .from(bomRevisions)
    .where(and(eq(bomRevisions.projectId, p.id), sql`${bomRevisions.status} <> 'locked'`))
    .orderBy(desc(bomRevisions.createdAt))
    .limit(1);
  return { ...p, activeRevisionId: rev?.id ?? null, activeRevisionLetter: rev?.letter ?? null };
}

export async function getActiveRevision(projectId: string) {
  const orgId = await getCurrentOrgId();
  const [row] = await db
    .select({ id: bomRevisions.id, letter: bomRevisions.letter, status: bomRevisions.status })
    .from(bomRevisions)
    .innerJoin(projects, eq(projects.id, bomRevisions.projectId))
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, orgId), sql`${bomRevisions.status} <> 'locked'`))
    .orderBy(desc(bomRevisions.createdAt))
    .limit(1);
  return row ?? null;
}

export async function getLines(revisionId: string) {
  const orgId = await getCurrentOrgId();
  // Defense-in-depth: scope through projects→org.
  return db
    .select({
      id: bomLines.id, qty: bomLines.qty, position: bomLines.position,
      unitPriceSnapshot: bomLines.unitPriceSnapshot,
      itemId: items.id, sku: items.sku, description: items.description,
      manufacturer: items.manufacturer, unit: items.unit, stockState: items.stockState,
      vendorName: vendors.name, categoryName: categories.name, subcategoryName: subcategories.name,
    })
    .from(bomLines)
    .innerJoin(items, eq(items.id, bomLines.itemId))
    .leftJoin(vendors, eq(vendors.id, items.vendorId))
    .leftJoin(categories, eq(categories.id, items.categoryId))
    .leftJoin(subcategories, eq(subcategories.id, items.subcategoryId))
    .innerJoin(bomRevisions, eq(bomRevisions.id, bomLines.revisionId))
    .innerJoin(projects, eq(projects.id, bomRevisions.projectId))
    .where(and(eq(bomLines.revisionId, revisionId), eq(projects.organizationId, orgId)))
    .orderBy(asc(bomLines.position));
}
