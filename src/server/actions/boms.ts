"use server";

import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { boms, bomRevisions, projects } from "@/db/schema";
import { requireSession } from "../auth-context";
import { audit } from "../audit";
import { copyRevisionContent } from "../lib/copy-revision";

const BomCreateInput = z.object({
  projectId: z.string().min(1),
  name: z.string().trim().min(1).max(200),
});
export type BomCreateInputType = z.infer<typeof BomCreateInput>;

const BomRenameInput = z.object({
  bomId: z.string().min(1),
  name: z.string().trim().min(1).max(200),
});

const BomDeleteInput = z.object({ bomId: z.string().min(1) });

const BomDuplicateInput = z.object({
  sourceBomId: z.string().min(1),
  targetProjectId: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  sourceRevisionId: z.string().min(1).optional(),
});
export type BomDuplicateInputType = z.infer<typeof BomDuplicateInput>;

async function loadProject(projectId: string) {
  const [p] = await db
    .select({ id: projects.id, code: projects.code, name: projects.name, deletedAt: projects.deletedAt })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!p || p.deletedAt) throw new Error("PROJECT_NOT_FOUND");
  return p;
}

async function loadBom(bomId: string) {
  const [b] = await db
    .select({
      id: boms.id,
      projectId: boms.projectId,
      name: boms.name,
      ownerId: boms.ownerId,
      deletedAt: boms.deletedAt,
    })
    .from(boms)
    .where(eq(boms.id, bomId))
    .limit(1);
  if (!b || b.deletedAt) throw new Error("BOM_NOT_FOUND");
  return b;
}

export async function createBom(input: BomCreateInputType): Promise<{ bomId: string; revisionId: string }> {
  const data = BomCreateInput.parse(input);
  const session = await requireSession();
  await loadProject(data.projectId);

  const result = await db.transaction(async tx => {
    const [bom] = await tx.insert(boms).values({
      projectId: data.projectId,
      name: data.name,
      ownerId: session.user.id,
      lastModifiedById: session.user.id,
    }).returning();
    const [revision] = await tx.insert(bomRevisions).values({
      bomId: bom.id,
      letter: "A",
      status: "draft",
      ownerId: session.user.id,
    }).returning();
    return { bomId: bom.id, revisionId: revision.id };
  });

  revalidatePath("/builder");
  revalidatePath("/dashboard");
  revalidatePath(`/projects/${data.projectId}`);
  await audit({
    kind: "bom.created",
    refType: "bom",
    refId: result.bomId,
    summary: `BOM "${data.name}" created`,
    payload: { projectId: data.projectId, name: data.name, revisionId: result.revisionId },
  });
  return result;
}

export async function renameBom(input: z.infer<typeof BomRenameInput>) {
  const { bomId, name } = BomRenameInput.parse(input);
  const session = await requireSession();
  const bom = await loadBom(bomId);

  await db.update(boms)
    .set({ name, lastModifiedById: session.user.id, updatedAt: new Date() })
    .where(and(eq(boms.id, bomId), isNull(boms.deletedAt)));

  revalidatePath("/builder");
  revalidatePath(`/projects/${bom.projectId}`);
  revalidatePath(`/builder/${bom.projectId}/${bomId}`);
  await audit({
    kind: "bom.renamed",
    refType: "bom",
    refId: bomId,
    summary: `BOM renamed to "${name}"`,
    payload: { projectId: bom.projectId, oldName: bom.name, newName: name },
  });
}

export async function deleteBom(input: z.infer<typeof BomDeleteInput>) {
  const { bomId } = BomDeleteInput.parse(input);
  await requireSession();
  const bom = await loadBom(bomId);

  await db.update(boms)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(boms.id, bomId));

  revalidatePath("/builder");
  revalidatePath(`/projects/${bom.projectId}`);
  await audit({
    kind: "bom.deleted",
    refType: "bom",
    refId: bomId,
    summary: `BOM "${bom.name}" archived`,
    payload: { projectId: bom.projectId },
  });
}

export async function duplicateBom(input: BomDuplicateInputType): Promise<{ bomId: string; revisionId: string }> {
  const data = BomDuplicateInput.parse(input);
  const session = await requireSession();

  const sourceBom = await loadBom(data.sourceBomId);
  await loadProject(data.targetProjectId);

  let sourceRevisionId = data.sourceRevisionId;
  if (sourceRevisionId) {
    const [check] = await db
      .select({ id: bomRevisions.id, bomId: bomRevisions.bomId })
      .from(bomRevisions)
      .where(eq(bomRevisions.id, sourceRevisionId))
      .limit(1);
    if (!check || check.bomId !== sourceBom.id) throw new Error("REVISION_NOT_FOUND");
  } else {
    const [latest] = await db
      .select({ id: bomRevisions.id })
      .from(bomRevisions)
      .where(eq(bomRevisions.bomId, sourceBom.id))
      .orderBy(bomRevisions.createdAt)
      .limit(1);
    if (!latest) throw new Error("REVISION_NOT_FOUND");
    sourceRevisionId = latest.id;
  }

  const result = await db.transaction(async tx => {
    const [createdBom] = await tx.insert(boms).values({
      projectId: data.targetProjectId,
      name: data.name,
      ownerId: session.user.id,
      lastModifiedById: session.user.id,
    }).returning();

    const [createdRev] = await tx.insert(bomRevisions).values({
      bomId: createdBom.id,
      letter: "A",
      status: "draft",
      ownerId: session.user.id,
    }).returning();

    await copyRevisionContent(tx, sourceRevisionId!, createdRev.id);
    return { bomId: createdBom.id, revisionId: createdRev.id };
  });

  revalidatePath("/builder");
  revalidatePath("/dashboard");
  revalidatePath(`/projects/${data.targetProjectId}`);
  if (sourceBom.projectId !== data.targetProjectId) {
    revalidatePath(`/projects/${sourceBom.projectId}`);
  }
  await audit({
    kind: "bom.duplicated",
    refType: "bom",
    refId: result.bomId,
    summary: `BOM "${sourceBom.name}" duplicated as "${data.name}"`,
    payload: {
      sourceBomId: sourceBom.id,
      sourceProjectId: sourceBom.projectId,
      targetProjectId: data.targetProjectId,
      sourceRevisionId,
      newRevisionId: result.revisionId,
    },
  });
  return result;
}
