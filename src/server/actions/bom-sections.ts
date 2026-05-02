"use server";

import { z } from "zod";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { bomLines, bomRevisions, bomSections, projects } from "@/db/schema";
import { getCurrentOrgId } from "../org";
import { audit } from "../audit";

async function ensureRevisionInOrg(revisionId: string) {
  const orgId = await getCurrentOrgId();
  const [row] = await db
    .select({ id: bomRevisions.id, status: bomRevisions.status, projectId: bomRevisions.projectId })
    .from(bomRevisions)
    .innerJoin(projects, eq(projects.id, bomRevisions.projectId))
    .where(and(eq(bomRevisions.id, revisionId), eq(projects.organizationId, orgId)))
    .limit(1);
  if (!row) throw new Error("REVISION_NOT_FOUND");
  if (row.status === "locked") throw new Error("REVISION_LOCKED");
  return { ...row, orgId };
}

async function ensureSectionAccess(sectionId: string) {
  const orgId = await getCurrentOrgId();
  const [row] = await db
    .select({
      id: bomSections.id,
      revisionId: bomSections.revisionId,
      projectId: bomRevisions.projectId,
      status: bomRevisions.status,
    })
    .from(bomSections)
    .innerJoin(bomRevisions, eq(bomRevisions.id, bomSections.revisionId))
    .innerJoin(projects, eq(projects.id, bomRevisions.projectId))
    .where(and(eq(bomSections.id, sectionId), eq(projects.organizationId, orgId)))
    .limit(1);
  if (!row) throw new Error("SECTION_NOT_FOUND");
  if (row.status === "locked") throw new Error("REVISION_LOCKED");
  return { ...row, orgId };
}

export async function createSection(input: { revisionId: string; name: string }) {
  const { revisionId, name } = z
    .object({ revisionId: z.string(), name: z.string().trim().min(1).max(120) })
    .parse(input);
  const rev = await ensureRevisionInOrg(revisionId);

  const [{ next }] = await db
    .select({ next: sql<number>`COALESCE(MAX(${bomSections.position}) + 1, 0)`.mapWith(Number) })
    .from(bomSections)
    .where(eq(bomSections.revisionId, revisionId));

  const [inserted] = await db
    .insert(bomSections)
    .values({ revisionId, name, position: next })
    .returning();

  revalidatePath(`/builder/${rev.projectId}`);
  await audit({
    kind: "bom.section.created",
    refType: "project",
    refId: rev.projectId,
    summary: `Section "${name}" added`,
    payload: { revisionId, sectionId: inserted.id },
  });
  return inserted;
}

export async function renameSection(input: { id: string; name: string }) {
  const { id, name } = z
    .object({ id: z.string(), name: z.string().trim().min(1).max(120) })
    .parse(input);
  const sec = await ensureSectionAccess(id);

  await db.update(bomSections).set({ name }).where(eq(bomSections.id, id));

  revalidatePath(`/builder/${sec.projectId}`);
  await audit({
    kind: "bom.section.renamed",
    refType: "project",
    refId: sec.projectId,
    summary: `Section renamed to "${name}"`,
    payload: { sectionId: id },
  });
}

export async function reorderSection(input: { id: string; position: number }) {
  const { id, position } = z
    .object({ id: z.string(), position: z.number().int().nonnegative() })
    .parse(input);
  const sec = await ensureSectionAccess(id);

  await db.transaction(async tx => {
    const siblings = await tx
      .select({ id: bomSections.id, position: bomSections.position })
      .from(bomSections)
      .where(eq(bomSections.revisionId, sec.revisionId))
      .orderBy(asc(bomSections.position));

    const without = siblings.filter(s => s.id !== id);
    const target = Math.min(position, without.length);
    const reordered = [...without.slice(0, target), { id, position: 0 }, ...without.slice(target)];

    for (let i = 0; i < reordered.length; i++) {
      if (reordered[i].position !== i) {
        await tx.update(bomSections).set({ position: i }).where(eq(bomSections.id, reordered[i].id));
      }
    }
  });

  revalidatePath(`/builder/${sec.projectId}`);
  await audit({
    kind: "bom.section.reordered",
    refType: "project",
    refId: sec.projectId,
    summary: `Section reordered`,
    payload: { sectionId: id, position },
  });
}

export async function deleteSection(input: {
  id: string;
  mode: "moveToUncategorized" | "deleteLines";
}) {
  const { id, mode } = z
    .object({
      id: z.string(),
      mode: z.enum(["moveToUncategorized", "deleteLines"]),
    })
    .parse(input);
  const sec = await ensureSectionAccess(id);

  let removedLineCount = 0;

  await db.transaction(async tx => {
    if (mode === "deleteLines") {
      // FK is ON DELETE SET NULL, so a cascade would orphan lines instead of removing them.
      // Delete lines explicitly first, then the section row.
      const removed = await tx.delete(bomLines).where(eq(bomLines.sectionId, id)).returning({ id: bomLines.id });
      removedLineCount = removed.length;
    }
    // For moveToUncategorized, the FK ON DELETE SET NULL handles it on section delete.
    await tx.delete(bomSections).where(eq(bomSections.id, id));
  });

  revalidatePath(`/builder/${sec.projectId}`);
  await audit({
    kind: "bom.section.deleted",
    refType: "project",
    refId: sec.projectId,
    summary:
      mode === "deleteLines"
        ? `Section deleted with ${removedLineCount} line(s)`
        : `Section deleted (lines kept)`,
    payload: { sectionId: id, mode, removedLineCount },
  });
}

export async function listSectionSuggestions(): Promise<string[]> {
  const orgId = await getCurrentOrgId();
  const rows = await db
    .select({
      name: bomSections.name,
      uses: count(bomSections.id).as("uses"),
    })
    .from(bomSections)
    .innerJoin(bomRevisions, eq(bomRevisions.id, bomSections.revisionId))
    .innerJoin(projects, eq(projects.id, bomRevisions.projectId))
    .where(eq(projects.organizationId, orgId))
    .groupBy(bomSections.name)
    .orderBy(desc(sql`uses`), asc(bomSections.name))
    .limit(50);
  return rows.map(r => r.name);
}
