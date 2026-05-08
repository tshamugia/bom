"use server";

import { z } from "zod";
import { asc, count, desc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { boms, bomLines, bomRevisions, bomSections } from "@/db/schema";
import { requireSession } from "../auth-context";
import { audit } from "../audit";
import { isRevisionImmutable } from "../lib/revision-status";

async function ensureRevisionWritable(revisionId: string) {
  await requireSession();
  const [row] = await db
    .select({
      id: bomRevisions.id,
      status: bomRevisions.status,
      bomId: bomRevisions.bomId,
      projectId: boms.projectId,
    })
    .from(bomRevisions)
    .innerJoin(boms, eq(boms.id, bomRevisions.bomId))
    .where(eq(bomRevisions.id, revisionId))
    .limit(1);
  if (!row) throw new Error("REVISION_NOT_FOUND");
  if (isRevisionImmutable(row.status)) throw new Error("REVISION_LOCKED");
  return row;
}

async function ensureSectionWritable(sectionId: string) {
  await requireSession();
  const [row] = await db
    .select({
      id: bomSections.id,
      revisionId: bomSections.revisionId,
      bomId: bomRevisions.bomId,
      projectId: boms.projectId,
      status: bomRevisions.status,
    })
    .from(bomSections)
    .innerJoin(bomRevisions, eq(bomRevisions.id, bomSections.revisionId))
    .innerJoin(boms, eq(boms.id, bomRevisions.bomId))
    .where(eq(bomSections.id, sectionId))
    .limit(1);
  if (!row) throw new Error("SECTION_NOT_FOUND");
  if (isRevisionImmutable(row.status)) throw new Error("REVISION_LOCKED");
  return row;
}

export async function createSection(input: { revisionId: string; name: string }) {
  const { revisionId, name } = z
    .object({ revisionId: z.string(), name: z.string().trim().min(1).max(120) })
    .parse(input);
  const rev = await ensureRevisionWritable(revisionId);

  const [{ next }] = await db
    .select({ next: sql<number>`COALESCE(MAX(${bomSections.position}) + 1, 0)`.mapWith(Number) })
    .from(bomSections)
    .where(eq(bomSections.revisionId, revisionId));

  const [inserted] = await db
    .insert(bomSections)
    .values({ revisionId, name, position: next })
    .returning();

  revalidatePath(`/builder/${rev.projectId}/${rev.bomId}`);
  await audit({
    kind: "bom.section.created",
    refType: "bom",
    refId: rev.bomId,
    summary: `Section "${name}" added`,
    payload: { revisionId, sectionId: inserted.id },
  });
  return inserted;
}

export async function renameSection(input: { id: string; name: string }) {
  const { id, name } = z
    .object({ id: z.string(), name: z.string().trim().min(1).max(120) })
    .parse(input);
  const sec = await ensureSectionWritable(id);

  await db.update(bomSections).set({ name }).where(eq(bomSections.id, id));

  revalidatePath(`/builder/${sec.projectId}/${sec.bomId}`);
  await audit({
    kind: "bom.section.renamed",
    refType: "bom",
    refId: sec.bomId,
    summary: `Section renamed to "${name}"`,
    payload: { sectionId: id },
  });
}

export async function reorderSection(input: { id: string; position: number }) {
  const { id, position } = z
    .object({ id: z.string(), position: z.number().int().nonnegative() })
    .parse(input);
  const sec = await ensureSectionWritable(id);

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

  revalidatePath(`/builder/${sec.projectId}/${sec.bomId}`);
  await audit({
    kind: "bom.section.reordered",
    refType: "bom",
    refId: sec.bomId,
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
  const sec = await ensureSectionWritable(id);

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

  revalidatePath(`/builder/${sec.projectId}/${sec.bomId}`);
  await audit({
    kind: "bom.section.deleted",
    refType: "bom",
    refId: sec.bomId,
    summary:
      mode === "deleteLines"
        ? `Section deleted with ${removedLineCount} line(s)`
        : `Section deleted (lines kept)`,
    payload: { sectionId: id, mode, removedLineCount },
  });
}

export async function listSectionSuggestions(): Promise<string[]> {
  await requireSession();
  const rows = await db
    .select({
      name: bomSections.name,
      uses: count(bomSections.id).as("uses"),
    })
    .from(bomSections)
    .groupBy(bomSections.name)
    .orderBy(desc(sql`uses`), asc(bomSections.name))
    .limit(50);
  return rows.map(r => r.name);
}
