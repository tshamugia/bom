import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { bomExports, bomRevisions, projects, user } from "@/db/schema";
import { requireSession } from "../auth-context";

export async function listExports() {
  await requireSession();
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
    .orderBy(desc(bomExports.generatedAt));
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
