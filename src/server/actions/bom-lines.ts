"use server";

import { z } from "zod";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { bomLines, bomRevisions, bomSections, items, vendors } from "@/db/schema";
import { requireSession } from "../auth-context";
import { audit } from "../audit";
import { isRevisionImmutable } from "../lib/revision-status";

async function ensureRevisionWritable(revisionId: string) {
  await requireSession();
  const [row] = await db
    .select({ id: bomRevisions.id, status: bomRevisions.status, projectId: bomRevisions.projectId })
    .from(bomRevisions)
    .where(eq(bomRevisions.id, revisionId))
    .limit(1);
  if (!row) throw new Error("REVISION_NOT_FOUND");
  if (isRevisionImmutable(row.status)) throw new Error("REVISION_LOCKED");
  return row;
}

async function nextPositionInSection(revisionId: string, sectionId: string | null) {
  const where = sectionId === null
    ? and(eq(bomLines.revisionId, revisionId), isNull(bomLines.sectionId))
    : and(eq(bomLines.revisionId, revisionId), eq(bomLines.sectionId, sectionId));
  const [{ next }] = await db
    .select({ next: sql<number>`COALESCE(MAX(${bomLines.position}) + 1, 0)`.mapWith(Number) })
    .from(bomLines)
    .where(where);
  return next;
}

export async function addLine(input: { revisionId: string; itemId: string; qty?: number; sectionId?: string | null }) {
  const { revisionId, itemId, sectionId } = z
    .object({
      revisionId: z.string(),
      itemId: z.string(),
      qty: z.number().int().positive().optional(),
      sectionId: z.string().nullable().optional(),
    })
    .parse(input);
  const rev = await ensureRevisionWritable(revisionId);

  const [item] = await db.select().from(items).where(eq(items.id, itemId)).limit(1);
  if (!item) throw new Error("ITEM_NOT_FOUND");

  const [vendorRow] = item.vendorId
    ? await db.select({ name: vendors.name }).from(vendors).where(eq(vendors.id, item.vendorId)).limit(1)
    : [];

  // Validate section belongs to this revision (defense-in-depth).
  if (sectionId) {
    const [section] = await db
      .select({ id: bomSections.id })
      .from(bomSections)
      .where(and(eq(bomSections.id, sectionId), eq(bomSections.revisionId, revisionId)))
      .limit(1);
    if (!section) throw new Error("SECTION_NOT_IN_REVISION");
  }

  const existing = await db.select().from(bomLines).where(and(eq(bomLines.revisionId, revisionId), eq(bomLines.itemId, itemId))).limit(1);
  if (existing[0]) {
    const next = existing[0].qty + (input.qty ?? 1);
    const [updated] = await db.update(bomLines).set({ qty: next }).where(eq(bomLines.id, existing[0].id)).returning();
    revalidatePath(`/builder/${rev.projectId}`);
    return updated;
  }

  const next = await nextPositionInSection(revisionId, sectionId ?? null);

  const [inserted] = await db.insert(bomLines).values({
    revisionId,
    sectionId: sectionId ?? null,
    itemId,
    qty: input.qty ?? 1,
    skuSnapshot: item.sku,
    descriptionSnapshot: item.description,
    manufacturerSnapshot: item.manufacturer,
    unitSnapshot: item.unit,
    vendorNameSnapshot: vendorRow?.name ?? null,
    position: next,
  }).returning();
  revalidatePath(`/builder/${rev.projectId}`);
  await audit({ kind: "bom.line.added", refType: "project", refId: rev.projectId, summary: `Added ${item.sku} to a BOM` });
  return inserted;
}

export async function updateLineQty(input: { id: string; qty: number }) {
  const { id, qty } = z.object({ id: z.string(), qty: z.number().int().nonnegative() }).parse(input);
  await requireSession();
  const [line] = await db
    .select({ id: bomLines.id, projectId: bomRevisions.projectId, status: bomRevisions.status })
    .from(bomLines)
    .innerJoin(bomRevisions, eq(bomRevisions.id, bomLines.revisionId))
    .where(eq(bomLines.id, id))
    .limit(1);
  if (!line) throw new Error("LINE_NOT_FOUND");
  if (isRevisionImmutable(line.status)) throw new Error("REVISION_LOCKED");
  await db.update(bomLines).set({ qty }).where(eq(bomLines.id, id));
  revalidatePath(`/builder/${line.projectId}`);
}

export async function removeLine(input: { id: string }) {
  await requireSession();
  const [line] = await db
    .select({ id: bomLines.id, projectId: bomRevisions.projectId, status: bomRevisions.status })
    .from(bomLines)
    .innerJoin(bomRevisions, eq(bomRevisions.id, bomLines.revisionId))
    .where(eq(bomLines.id, input.id))
    .limit(1);
  if (!line) throw new Error("LINE_NOT_FOUND");
  if (isRevisionImmutable(line.status)) throw new Error("REVISION_LOCKED");
  await db.delete(bomLines).where(eq(bomLines.id, input.id));
  revalidatePath(`/builder/${line.projectId}`);
}

export async function moveLineToSection(input: { lineId: string; sectionId: string | null; position?: number }) {
  const { lineId, sectionId, position } = z
    .object({
      lineId: z.string(),
      sectionId: z.string().nullable(),
      position: z.number().int().nonnegative().optional(),
    })
    .parse(input);
  await requireSession();

  const [line] = await db
    .select({
      id: bomLines.id,
      revisionId: bomLines.revisionId,
      sectionId: bomLines.sectionId,
      position: bomLines.position,
      projectId: bomRevisions.projectId,
      status: bomRevisions.status,
    })
    .from(bomLines)
    .innerJoin(bomRevisions, eq(bomRevisions.id, bomLines.revisionId))
    .where(eq(bomLines.id, lineId))
    .limit(1);
  if (!line) throw new Error("LINE_NOT_FOUND");
  if (isRevisionImmutable(line.status)) throw new Error("REVISION_LOCKED");

  // Validate destination section belongs to the same revision.
  if (sectionId) {
    const [section] = await db
      .select({ id: bomSections.id })
      .from(bomSections)
      .where(and(eq(bomSections.id, sectionId), eq(bomSections.revisionId, line.revisionId)))
      .limit(1);
    if (!section) throw new Error("SECTION_NOT_IN_REVISION");
  }

  const sourceSectionId = line.sectionId;
  const sameSection = sourceSectionId === sectionId;

  await db.transaction(async tx => {
    const destWhere = sectionId === null
      ? and(eq(bomLines.revisionId, line.revisionId), isNull(bomLines.sectionId))
      : and(eq(bomLines.revisionId, line.revisionId), eq(bomLines.sectionId, sectionId));

    const destSiblings = await tx
      .select({ id: bomLines.id, position: bomLines.position })
      .from(bomLines)
      .where(destWhere)
      .orderBy(asc(bomLines.position));

    const without = destSiblings.filter(s => s.id !== lineId);
    const target = position === undefined ? without.length : Math.min(position, without.length);
    const reordered = [...without.slice(0, target), { id: lineId, position: 0 }, ...without.slice(target)];

    for (let i = 0; i < reordered.length; i++) {
      const row = reordered[i];
      if (row.id === lineId) {
        await tx
          .update(bomLines)
          .set({ sectionId, position: i })
          .where(eq(bomLines.id, lineId));
      } else if (row.position !== i) {
        await tx.update(bomLines).set({ position: i }).where(eq(bomLines.id, row.id));
      }
    }

    if (!sameSection) {
      // Compact the source section so positions stay contiguous.
      const sourceWhere = sourceSectionId === null
        ? and(eq(bomLines.revisionId, line.revisionId), isNull(bomLines.sectionId))
        : and(eq(bomLines.revisionId, line.revisionId), eq(bomLines.sectionId, sourceSectionId));

      const sourceSiblings = await tx
        .select({ id: bomLines.id, position: bomLines.position })
        .from(bomLines)
        .where(sourceWhere)
        .orderBy(asc(bomLines.position));

      for (let i = 0; i < sourceSiblings.length; i++) {
        if (sourceSiblings[i].position !== i) {
          await tx.update(bomLines).set({ position: i }).where(eq(bomLines.id, sourceSiblings[i].id));
        }
      }
    }
  });

  revalidatePath(`/builder/${line.projectId}`);
  if (!sameSection) {
    await audit({
      kind: "bom.line.moved",
      refType: "project",
      refId: line.projectId,
      summary: "Line moved between sections",
      payload: { lineId, fromSectionId: sourceSectionId, toSectionId: sectionId },
    });
  }
}

const CsvRow = z.object({ sku: z.string().min(1), qty: z.coerce.number().int().positive() });
export async function importCsv(input: { revisionId: string; rows: Array<{ sku: string; qty: number | string }> }) {
  const rev = await ensureRevisionWritable(input.revisionId);
  const parsed = input.rows.map(r => CsvRow.parse(r));

  const skuToItem = new Map(
    (await db.select().from(items)).map(i => [i.sku, i]),
  );

  let added = 0;
  const missing: string[] = [];
  for (const r of parsed) {
    const it = skuToItem.get(r.sku);
    if (!it) { missing.push(r.sku); continue; }
    await addLine({ revisionId: rev.id, itemId: it.id, qty: r.qty });
    added++;
  }
  return { added, missing };
}
