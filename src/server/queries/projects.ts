import "server-only";
import { aliasedTable } from "drizzle-orm";
import { and, asc, count, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { projects, bomRevisions, bomLines, bomSections, items, vendors, categories, subcategories, user } from "@/db/schema";
import { getCurrentOrgId } from "../org";

export async function listProjects() {
  const orgId = await getCurrentOrgId();
  return db.execute(sql/* sql */`
    SELECT
      p.id, p.code, p.name, p.status, p.updated_at AS "updatedAt", p.target_date AS "targetDate",
      u.name AS "ownerName",
      stats.letter AS "revLetter",
      COALESCE(stats.line_count, 0)::int AS "lineCount",
      COALESCE(stats.total, 0)::float    AS "total",
      wf.status AS "workflowStatus",
      wf.active_role AS "workflowActiveRole"
    FROM "project" p
    LEFT JOIN "user" u ON u.id = p.owner_id
    LEFT JOIN LATERAL (
      SELECT r.id, r.letter, COUNT(l.*) AS line_count, COALESCE(SUM(l.qty * l.unit_price_snapshot), 0) AS total
      FROM "bom_revision" r
      LEFT JOIN "bom_line" l ON l.revision_id = r.id
      WHERE r.project_id = p.id AND r.status <> 'locked'
      GROUP BY r.id
      ORDER BY r.created_at DESC LIMIT 1
    ) stats ON TRUE
    LEFT JOIN LATERAL (
      SELECT w.status,
        (SELECT s.role FROM "approval_step" s WHERE s.workflow_id = w.id AND s.position = w.current_step_index LIMIT 1) AS active_role
      FROM "approval_workflow" w
      INNER JOIN "bom_revision" r2 ON r2.id = w.revision_id
      WHERE r2.project_id = p.id AND w.status <> 'cancelled'
      ORDER BY w.requested_at DESC LIMIT 1
    ) wf ON TRUE
    WHERE p.organization_id = ${orgId}
    ORDER BY p.updated_at DESC
  `).then(r => r as unknown as Array<{
    id: string; code: string; name: string; status: string;
    updatedAt: Date; targetDate: string | null;
    ownerName: string | null; revLetter: string | null;
    lineCount: number; total: number;
    workflowStatus: "pending" | "approved" | "rejected" | null;
    workflowActiveRole: string | null;
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

export type ActiveRevision = {
  id: string;
  letter: string;
  status: "draft" | "committed" | "in-progress" | "review" | "approved" | "locked";
  ownerId: string | null;
  ownerName: string | null;
  committedById: string | null;
  committedByName: string | null;
  committedAt: Date | null;
  commitMessage: string | null;
  parentRevisionId: string | null;
  parentLetter: string | null;
};

export async function getActiveRevision(projectId: string): Promise<ActiveRevision | null> {
  const orgId = await getCurrentOrgId();
  const ownerUser = aliasedTable(user, "owner_user");
  const committedByUser = aliasedTable(user, "committed_by_user");
  const parent = aliasedTable(bomRevisions, "parent_rev");
  const [row] = await db
    .select({
      id: bomRevisions.id,
      letter: bomRevisions.letter,
      status: bomRevisions.status,
      ownerId: bomRevisions.ownerId,
      ownerName: ownerUser.name,
      committedById: bomRevisions.committedById,
      committedByName: committedByUser.name,
      committedAt: bomRevisions.committedAt,
      commitMessage: bomRevisions.commitMessage,
      parentRevisionId: bomRevisions.parentRevisionId,
      parentLetter: parent.letter,
    })
    .from(bomRevisions)
    .innerJoin(projects, eq(projects.id, bomRevisions.projectId))
    .leftJoin(ownerUser, eq(ownerUser.id, bomRevisions.ownerId))
    .leftJoin(committedByUser, eq(committedByUser.id, bomRevisions.committedById))
    .leftJoin(parent, eq(parent.id, bomRevisions.parentRevisionId))
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, orgId), sql`${bomRevisions.status} <> 'locked'`))
    .orderBy(desc(bomRevisions.createdAt))
    .limit(1);
  return (row as ActiveRevision | undefined) ?? null;
}

export async function getLatestProcurementRevision(projectId: string) {
  const orgId = await getCurrentOrgId();
  const [row] = await db
    .select({
      id: bomRevisions.id,
      letter: bomRevisions.letter,
      status: bomRevisions.status,
    })
    .from(bomRevisions)
    .innerJoin(projects, eq(projects.id, bomRevisions.projectId))
    .where(and(
      eq(bomRevisions.projectId, projectId),
      eq(projects.organizationId, orgId),
      ne(bomRevisions.status, "draft"),
    ))
    .orderBy(desc(bomRevisions.createdAt))
    .limit(1);
  return row ?? null;
}

export async function hasOpenDraftForProject(projectId: string, excludeRevisionId?: string) {
  const orgId = await getCurrentOrgId();
  const where = excludeRevisionId
    ? and(
        eq(bomRevisions.projectId, projectId),
        eq(bomRevisions.status, "draft"),
        eq(projects.organizationId, orgId),
        ne(bomRevisions.id, excludeRevisionId),
      )
    : and(
        eq(bomRevisions.projectId, projectId),
        eq(bomRevisions.status, "draft"),
        eq(projects.organizationId, orgId),
      );
  const [{ n }] = await db
    .select({ n: count() })
    .from(bomRevisions)
    .innerJoin(projects, eq(projects.id, bomRevisions.projectId))
    .where(where);
  return n > 0;
}

export async function getLines(revisionId: string) {
  const orgId = await getCurrentOrgId();
  // Defense-in-depth: scope through projects→org.
  // Order by section position (NULLS FIRST so Uncategorized lines come first), then line position.
  return db
    .select({
      id: bomLines.id, qty: bomLines.qty, position: bomLines.position,
      unitPriceSnapshot: bomLines.unitPriceSnapshot,
      itemId: items.id, sku: items.sku, description: items.description,
      manufacturer: items.manufacturer, unit: items.unit, stockState: items.stockState,
      vendorName: vendors.name, categoryName: categories.name, subcategoryName: subcategories.name,
      sectionId: bomLines.sectionId,
      sectionName: bomSections.name,
      sectionPosition: bomSections.position,
    })
    .from(bomLines)
    .innerJoin(items, eq(items.id, bomLines.itemId))
    .leftJoin(vendors, eq(vendors.id, items.vendorId))
    .leftJoin(categories, eq(categories.id, items.categoryId))
    .leftJoin(subcategories, eq(subcategories.id, items.subcategoryId))
    .leftJoin(bomSections, eq(bomSections.id, bomLines.sectionId))
    .innerJoin(bomRevisions, eq(bomRevisions.id, bomLines.revisionId))
    .innerJoin(projects, eq(projects.id, bomRevisions.projectId))
    .where(and(eq(bomLines.revisionId, revisionId), eq(projects.organizationId, orgId)))
    .orderBy(sql`${bomSections.position} ASC NULLS FIRST`, asc(bomLines.position));
}

export async function getSections(revisionId: string) {
  const orgId = await getCurrentOrgId();
  return db
    .select({
      id: bomSections.id,
      name: bomSections.name,
      position: bomSections.position,
    })
    .from(bomSections)
    .innerJoin(bomRevisions, eq(bomRevisions.id, bomSections.revisionId))
    .innerJoin(projects, eq(projects.id, bomRevisions.projectId))
    .where(and(eq(bomSections.revisionId, revisionId), eq(projects.organizationId, orgId)))
    .orderBy(asc(bomSections.position));
}
