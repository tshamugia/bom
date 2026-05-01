import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { bomExports, bomRevisions, projects, user } from "@/db/schema";
import { getCurrentOrgId } from "../org";

export async function listExports() {
  const orgId = await getCurrentOrgId();
  return db
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
      projectCode: projects.code,
      projectName: projects.name,
    })
    .from(bomExports)
    .innerJoin(bomRevisions, eq(bomRevisions.id, bomExports.revisionId))
    .innerJoin(projects, eq(projects.id, bomRevisions.projectId))
    .leftJoin(user, eq(user.id, bomExports.generatedById))
    .where(eq(projects.organizationId, orgId))
    .orderBy(desc(bomExports.generatedAt));
}

export async function getExport(id: string) {
  const orgId = await getCurrentOrgId();
  const [row] = await db
    .select({
      id: bomExports.id,
      fileKey: bomExports.fileKey,
      fileName: bomExports.fileName,
      format: bomExports.format,
    })
    .from(bomExports)
    .innerJoin(bomRevisions, eq(bomRevisions.id, bomExports.revisionId))
    .innerJoin(projects, eq(projects.id, bomRevisions.projectId))
    .where(and(eq(bomExports.id, id), eq(projects.organizationId, orgId)))
    .limit(1);
  return row ?? null;
}
