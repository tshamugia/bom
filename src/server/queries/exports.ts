import "server-only";
import { and, desc, eq, gte, inArray, lte, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { bomExports, boms, bomRevisions, projects, user } from "@/db/schema";
import { requireSession } from "../auth-context";

export type ExportsFilter = {
  projectIds?: string[];
  from?: Date;
  to?: Date;
};

export async function listExports(filter: ExportsFilter = {}) {
  await requireSession();
  const conds: SQL[] = [];
  if (filter.projectIds && filter.projectIds.length > 0) {
    conds.push(inArray(boms.projectId, filter.projectIds));
  }
  if (filter.from) conds.push(gte(bomExports.generatedAt, filter.from));
  if (filter.to) conds.push(lte(bomExports.generatedAt, filter.to));

  const query = db
    .select({
      id: bomExports.id,
      fileName: bomExports.fileName,
      format: bomExports.format,
      byteSize: bomExports.byteSize,
      generatedAt: bomExports.generatedAt,
      generatedById: bomExports.generatedById,
      generatedByName: user.name,
      status: bomExports.status,
      revisionLetter: bomRevisions.letter,
      bomId: bomRevisions.bomId,
      bomName: boms.name,
      projectId: boms.projectId,
      projectCode: projects.code,
      projectName: projects.name,
    })
    .from(bomExports)
    .innerJoin(bomRevisions, eq(bomRevisions.id, bomExports.revisionId))
    .innerJoin(boms, eq(boms.id, bomRevisions.bomId))
    .innerJoin(projects, eq(projects.id, boms.projectId))
    .leftJoin(user, eq(user.id, bomExports.generatedById));

  return (conds.length > 0 ? query.where(and(...conds)) : query).orderBy(desc(bomExports.generatedAt));
}

export async function getExport(id: string) {
  await requireSession();
  const [row] = await db
    .select({
      id: bomExports.id,
      fileKey: bomExports.fileKey,
      fileName: bomExports.fileName,
      format: bomExports.format,
    })
    .from(bomExports)
    .where(eq(bomExports.id, id))
    .limit(1);
  return row ?? null;
}
