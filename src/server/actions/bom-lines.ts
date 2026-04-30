"use server";

import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { bomLines, bomRevisions, items, projects } from "@/db/schema";
import { getCurrentOrgId } from "../org";

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

export async function addLine(input: { revisionId: string; itemId: string; qty?: number }) {
  const { revisionId, itemId } = z.object({ revisionId: z.string(), itemId: z.string(), qty: z.number().int().positive().optional() }).parse(input);
  const { orgId, ...rev } = await ensureRevisionInOrg(revisionId);

  const [item] = await db.select().from(items).where(and(eq(items.id, itemId), eq(items.organizationId, orgId))).limit(1);
  if (!item) throw new Error("ITEM_NOT_FOUND");

  const existing = await db.select().from(bomLines).where(and(eq(bomLines.revisionId, revisionId), eq(bomLines.itemId, itemId))).limit(1);
  if (existing[0]) {
    const next = existing[0].qty + (input.qty ?? 1);
    const [updated] = await db.update(bomLines).set({ qty: next }).where(eq(bomLines.id, existing[0].id)).returning();
    revalidatePath(`/builder/${rev.projectId}`);
    return updated;
  }

  const [{ next }] = await db.select({ next: sql<number>`COALESCE(MAX(${bomLines.position}) + 1, 0)`.mapWith(Number) }).from(bomLines).where(eq(bomLines.revisionId, revisionId));

  const [inserted] = await db.insert(bomLines).values({
    revisionId, itemId, qty: input.qty ?? 1, unitPriceSnapshot: item.unitPrice, position: next,
  }).returning();
  revalidatePath(`/builder/${rev.projectId}`);
  return inserted;
}

export async function updateLineQty(input: { id: string; qty: number }) {
  const { id, qty } = z.object({ id: z.string(), qty: z.number().int().nonnegative() }).parse(input);
  const orgId = await getCurrentOrgId();
  const [line] = await db
    .select({ id: bomLines.id, projectId: bomRevisions.projectId, status: bomRevisions.status })
    .from(bomLines)
    .innerJoin(bomRevisions, eq(bomRevisions.id, bomLines.revisionId))
    .innerJoin(projects, eq(projects.id, bomRevisions.projectId))
    .where(and(eq(bomLines.id, id), eq(projects.organizationId, orgId)))
    .limit(1);
  if (!line) throw new Error("LINE_NOT_FOUND");
  if (line.status === "locked") throw new Error("REVISION_LOCKED");
  await db.update(bomLines).set({ qty }).where(eq(bomLines.id, id));
  revalidatePath(`/builder/${line.projectId}`);
}

export async function removeLine(input: { id: string }) {
  const orgId = await getCurrentOrgId();
  const [line] = await db
    .select({ id: bomLines.id, projectId: bomRevisions.projectId, status: bomRevisions.status })
    .from(bomLines)
    .innerJoin(bomRevisions, eq(bomRevisions.id, bomLines.revisionId))
    .innerJoin(projects, eq(projects.id, bomRevisions.projectId))
    .where(and(eq(bomLines.id, input.id), eq(projects.organizationId, orgId)))
    .limit(1);
  if (!line) throw new Error("LINE_NOT_FOUND");
  if (line.status === "locked") throw new Error("REVISION_LOCKED");
  await db.delete(bomLines).where(eq(bomLines.id, input.id));
  revalidatePath(`/builder/${line.projectId}`);
}

const CsvRow = z.object({ sku: z.string().min(1), qty: z.coerce.number().int().positive() });
export async function importCsv(input: { revisionId: string; rows: Array<{ sku: string; qty: number | string }> }) {
  const { orgId, ...rev } = await ensureRevisionInOrg(input.revisionId);
  const parsed = input.rows.map(r => CsvRow.parse(r));

  const skuToItem = new Map(
    (await db.select().from(items).where(eq(items.organizationId, orgId))).map(i => [i.sku, i]),
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
