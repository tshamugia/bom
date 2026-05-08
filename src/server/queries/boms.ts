import "server-only";
import { aliasedTable, and, asc, count, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { boms, projects, user } from "@/db/schema";
import { requireSession } from "../auth-context";

export type BomListRow = {
  id: string;
  name: string;
  ownerId: string | null;
  ownerName: string | null;
  activeRevisionId: string | null;
  activeRevisionLetter: string | null;
  activeRevisionStatus: string | null;
  lineCount: number;
  bomCount?: never;
  updatedAt: Date;
  createdAt: Date;
};

export type BomListAllRow = BomListRow & {
  projectId: string;
  projectCode: string;
  projectName: string;
};

export async function listAllBoms(): Promise<BomListAllRow[]> {
  await requireSession();
  const rows = await db.execute(sql/* sql */`
    SELECT
      b.id,
      b.name,
      b.owner_id  AS "ownerId",
      u.name      AS "ownerName",
      b.created_at AS "createdAt",
      b.updated_at AS "updatedAt",
      b.project_id AS "projectId",
      p.code      AS "projectCode",
      p.name      AS "projectName",
      latest.id     AS "activeRevisionId",
      latest.letter AS "activeRevisionLetter",
      latest.status AS "activeRevisionStatus",
      COALESCE(lc.line_count, 0)::int AS "lineCount"
    FROM "bom" b
    INNER JOIN "project" p ON p.id = b.project_id
    LEFT JOIN "user" u ON u.id = b.owner_id
    LEFT JOIN LATERAL (
      SELECT r.id, r.letter, r.status
      FROM "bom_revision" r
      WHERE r.bom_id = b.id AND r.status <> 'locked'
      ORDER BY r.created_at DESC LIMIT 1
    ) latest ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(l.*) AS line_count
      FROM "bom_line" l
      WHERE l.revision_id = latest.id
    ) lc ON TRUE
    WHERE b.deleted_at IS NULL AND p.deleted_at IS NULL
    ORDER BY b.updated_at DESC
  `);
  return rows as unknown as BomListAllRow[];
}

export async function listBomsByProject(projectId: string): Promise<BomListRow[]> {
  await requireSession();
  const rows = await db.execute(sql/* sql */`
    SELECT
      b.id,
      b.name,
      b.owner_id  AS "ownerId",
      u.name      AS "ownerName",
      b.created_at AS "createdAt",
      b.updated_at AS "updatedAt",
      latest.id     AS "activeRevisionId",
      latest.letter AS "activeRevisionLetter",
      latest.status AS "activeRevisionStatus",
      COALESCE(lc.line_count, 0)::int AS "lineCount"
    FROM "bom" b
    LEFT JOIN "user" u ON u.id = b.owner_id
    LEFT JOIN LATERAL (
      SELECT r.id, r.letter, r.status
      FROM "bom_revision" r
      WHERE r.bom_id = b.id AND r.status <> 'locked'
      ORDER BY r.created_at DESC LIMIT 1
    ) latest ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(l.*) AS line_count
      FROM "bom_line" l
      WHERE l.revision_id = latest.id
    ) lc ON TRUE
    WHERE b.project_id = ${projectId} AND b.deleted_at IS NULL
    ORDER BY b.updated_at DESC
  `);
  return rows as unknown as BomListRow[];
}

export async function getBom(bomId: string) {
  await requireSession();
  const ownerUser = aliasedTable(user, "bom_owner");
  const [b] = await db
    .select({
      id: boms.id,
      projectId: boms.projectId,
      name: boms.name,
      ownerId: boms.ownerId,
      ownerName: ownerUser.name,
      deletedAt: boms.deletedAt,
      createdAt: boms.createdAt,
      updatedAt: boms.updatedAt,
      projectCode: projects.code,
      projectName: projects.name,
    })
    .from(boms)
    .innerJoin(projects, eq(projects.id, boms.projectId))
    .leftJoin(ownerUser, eq(ownerUser.id, boms.ownerId))
    .where(and(eq(boms.id, bomId), isNull(boms.deletedAt)))
    .limit(1);
  return b ?? null;
}

export async function getBomByProjectMostRecent(projectId: string) {
  await requireSession();
  const [b] = await db
    .select({ id: boms.id, name: boms.name })
    .from(boms)
    .where(and(eq(boms.projectId, projectId), isNull(boms.deletedAt)))
    .orderBy(desc(boms.updatedAt))
    .limit(1);
  return b ?? null;
}

export async function countBomsByProject(projectId: string) {
  await requireSession();
  const [{ n }] = await db
    .select({ n: count() })
    .from(boms)
    .where(and(eq(boms.projectId, projectId), isNull(boms.deletedAt)));
  return n;
}

export async function listAllBomNames(): Promise<Array<{ id: string; name: string; projectId: string; projectCode: string; projectName: string }>> {
  await requireSession();
  return db
    .select({
      id: boms.id,
      name: boms.name,
      projectId: boms.projectId,
      projectCode: projects.code,
      projectName: projects.name,
    })
    .from(boms)
    .innerJoin(projects, eq(projects.id, boms.projectId))
    .where(and(isNull(boms.deletedAt), isNull(projects.deletedAt)))
    .orderBy(asc(projects.code), asc(boms.name));
}

export async function listProjectsForPicker(): Promise<Array<{ id: string; code: string; name: string }>> {
  await requireSession();
  return db
    .select({ id: projects.id, code: projects.code, name: projects.name })
    .from(projects)
    .where(isNull(projects.deletedAt))
    .orderBy(asc(projects.code));
}
