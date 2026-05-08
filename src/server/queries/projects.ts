import "server-only";
import { aliasedTable } from "drizzle-orm";
import { and, asc, count, desc, eq, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { projects, boms, bomRevisions, bomLines, bomSections, items, vendors, categories, subcategories, user } from "@/db/schema";
import { requireSession } from "../auth-context";

export async function listOwnerCandidates() {
  await requireSession();
  return db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(eq(user.disabled, false))
    .orderBy(asc(user.name));
}

export async function listArchivedProjects() {
  await requireSession();
  return db
    .select({
      id: projects.id, code: projects.code, name: projects.name,
      deletedAt: projects.deletedAt,
    })
    .from(projects)
    .where(isNotNull(projects.deletedAt))
    .orderBy(desc(projects.deletedAt));
}

export async function listProjects() {
  await requireSession();
  return db.execute(sql/* sql */`
    SELECT
      p.id, p.code, p.name, p.updated_at AS "updatedAt", p.target_date AS "targetDate",
      u.name AS "ownerName",
      COALESCE(bom_stats.bom_count, 0)::int AS "bomCount",
      COALESCE(line_stats.line_count, 0)::int AS "lineCount",
      latest.letter AS "revLetter"
    FROM "project" p
    LEFT JOIN "user" u ON u.id = p.owner_id
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS bom_count
      FROM "bom" b
      WHERE b.project_id = p.id AND b.deleted_at IS NULL
    ) bom_stats ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(l.*) AS line_count
      FROM "bom" b
      INNER JOIN "bom_revision" r ON r.bom_id = b.id
      LEFT JOIN "bom_line" l ON l.revision_id = r.id
      WHERE b.project_id = p.id AND b.deleted_at IS NULL AND r.status <> 'locked'
    ) line_stats ON TRUE
    LEFT JOIN LATERAL (
      SELECT r.letter
      FROM "bom" b
      INNER JOIN "bom_revision" r ON r.bom_id = b.id
      WHERE b.project_id = p.id AND b.deleted_at IS NULL AND r.status <> 'locked'
      ORDER BY r.created_at DESC LIMIT 1
    ) latest ON TRUE
    WHERE p.deleted_at IS NULL
    ORDER BY p.updated_at DESC
  `).then(r => r as unknown as Array<{
    id: string; code: string; name: string;
    updatedAt: Date; targetDate: string | null;
    ownerName: string | null;
    bomCount: number;
    lineCount: number;
    revLetter: string | null;
  }>);
}

export async function getProject(id: string) {
  await requireSession();
  const [p] = await db.select().from(projects)
    .where(and(eq(projects.id, id), sql`${projects.deletedAt} IS NULL`))
    .limit(1);
  if (!p) return null;
  return p;
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

export async function getActiveRevision(bomId: string): Promise<ActiveRevision | null> {
  await requireSession();
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
    .leftJoin(ownerUser, eq(ownerUser.id, bomRevisions.ownerId))
    .leftJoin(committedByUser, eq(committedByUser.id, bomRevisions.committedById))
    .leftJoin(parent, eq(parent.id, bomRevisions.parentRevisionId))
    .where(and(eq(bomRevisions.bomId, bomId), sql`${bomRevisions.status} <> 'locked'`))
    .orderBy(desc(bomRevisions.createdAt))
    .limit(1);
  return (row as ActiveRevision | undefined) ?? null;
}

export async function getLatestProcurementRevision(bomId: string) {
  await requireSession();
  const [row] = await db
    .select({
      id: bomRevisions.id,
      letter: bomRevisions.letter,
      status: bomRevisions.status,
    })
    .from(bomRevisions)
    .where(and(
      eq(bomRevisions.bomId, bomId),
      ne(bomRevisions.status, "draft"),
    ))
    .orderBy(desc(bomRevisions.createdAt))
    .limit(1);
  return row ?? null;
}

export async function hasOpenDraftForBom(bomId: string, excludeRevisionId?: string) {
  await requireSession();
  const where = excludeRevisionId
    ? and(
        eq(bomRevisions.bomId, bomId),
        eq(bomRevisions.status, "draft"),
        ne(bomRevisions.id, excludeRevisionId),
      )
    : and(
        eq(bomRevisions.bomId, bomId),
        eq(bomRevisions.status, "draft"),
      );
  const [{ n }] = await db
    .select({ n: count() })
    .from(bomRevisions)
    .where(where);
  return n > 0;
}

export async function getLines(revisionId: string) {
  await requireSession();
  return db
    .select({
      id: bomLines.id, qty: bomLines.qty, position: bomLines.position,
      itemId: items.id, sku: items.sku, description: items.description,
      manufacturer: items.manufacturer, unit: items.unit,
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
    .where(eq(bomLines.revisionId, revisionId))
    .orderBy(sql`${bomSections.position} ASC NULLS FIRST`, asc(bomLines.position));
}

export async function getSections(revisionId: string) {
  await requireSession();
  return db
    .select({
      id: bomSections.id,
      name: bomSections.name,
      position: bomSections.position,
    })
    .from(bomSections)
    .where(eq(bomSections.revisionId, revisionId))
    .orderBy(asc(bomSections.position));
}

// Compatibility wrapper for any callers that still pass projectId.
// Returns the most-recently-updated active revision across all of the project's BOMs.
export async function getActiveRevisionForProject(projectId: string): Promise<ActiveRevision | null> {
  await requireSession();
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
    .innerJoin(boms, eq(boms.id, bomRevisions.bomId))
    .leftJoin(ownerUser, eq(ownerUser.id, bomRevisions.ownerId))
    .leftJoin(committedByUser, eq(committedByUser.id, bomRevisions.committedById))
    .leftJoin(parent, eq(parent.id, bomRevisions.parentRevisionId))
    .where(and(eq(boms.projectId, projectId), sql`${boms.deletedAt} IS NULL`, sql`${bomRevisions.status} <> 'locked'`))
    .orderBy(desc(bomRevisions.createdAt))
    .limit(1);
  return (row as ActiveRevision | undefined) ?? null;
}
