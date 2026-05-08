import "server-only";
import { eq } from "drizzle-orm";
import type { db as Db } from "@/db/client";
import { bomLines, bomSections, items, vendors } from "@/db/schema";

type Tx = Parameters<Parameters<typeof Db.transaction>[0]>[0];

export async function copyRevisionContent(
  tx: Tx,
  sourceRevisionId: string,
  targetRevisionId: string,
): Promise<void> {
  const sourceSections = await tx
    .select()
    .from(bomSections)
    .where(eq(bomSections.revisionId, sourceRevisionId));

  const sectionIdMap = new Map<string, string>();
  for (const s of sourceSections) {
    const [created] = await tx
      .insert(bomSections)
      .values({
        revisionId: targetRevisionId,
        sectionKey: s.sectionKey,
        name: s.name,
        position: s.position,
      })
      .returning();
    sectionIdMap.set(s.id, created.id);
  }

  const sourceLines = await tx
    .select({
      sectionId: bomLines.sectionId,
      itemId: bomLines.itemId,
      qty: bomLines.qty,
      position: bomLines.position,
      skuSnapshot: bomLines.skuSnapshot,
      descriptionSnapshot: bomLines.descriptionSnapshot,
      manufacturerSnapshot: bomLines.manufacturerSnapshot,
      unitSnapshot: bomLines.unitSnapshot,
      vendorNameSnapshot: bomLines.vendorNameSnapshot,
    })
    .from(bomLines)
    .where(eq(bomLines.revisionId, sourceRevisionId));

  for (const l of sourceLines) {
    await tx.insert(bomLines).values({
      revisionId: targetRevisionId,
      sectionId: l.sectionId ? sectionIdMap.get(l.sectionId) ?? null : null,
      itemId: l.itemId,
      qty: l.qty,
      skuSnapshot: l.skuSnapshot,
      descriptionSnapshot: l.descriptionSnapshot,
      manufacturerSnapshot: l.manufacturerSnapshot,
      unitSnapshot: l.unitSnapshot,
      vendorNameSnapshot: l.vendorNameSnapshot,
      position: l.position,
    });
  }
}

export async function copyRevisionContentRefreshed(
  tx: Tx,
  sourceRevisionId: string,
  targetRevisionId: string,
): Promise<void> {
  const sourceSections = await tx
    .select()
    .from(bomSections)
    .where(eq(bomSections.revisionId, sourceRevisionId));

  const sectionIdMap = new Map<string, string>();
  for (const s of sourceSections) {
    const [created] = await tx
      .insert(bomSections)
      .values({
        revisionId: targetRevisionId,
        sectionKey: s.sectionKey,
        name: s.name,
        position: s.position,
      })
      .returning();
    sectionIdMap.set(s.id, created.id);
  }

  const sourceLines = await tx
    .select({
      sectionId: bomLines.sectionId,
      itemId: bomLines.itemId,
      qty: bomLines.qty,
      position: bomLines.position,
    })
    .from(bomLines)
    .where(eq(bomLines.revisionId, sourceRevisionId));

  for (const l of sourceLines) {
    const [item] = await tx
      .select({
        sku: items.sku,
        description: items.description,
        manufacturer: items.manufacturer,
        unit: items.unit,
        vendorId: items.vendorId,
      })
      .from(items)
      .where(eq(items.id, l.itemId))
      .limit(1);
    if (!item) continue;
    const [vendor] = item.vendorId
      ? await tx.select({ name: vendors.name }).from(vendors).where(eq(vendors.id, item.vendorId)).limit(1)
      : [];
    await tx.insert(bomLines).values({
      revisionId: targetRevisionId,
      sectionId: l.sectionId ? sectionIdMap.get(l.sectionId) ?? null : null,
      itemId: l.itemId,
      qty: l.qty,
      skuSnapshot: item.sku,
      descriptionSnapshot: item.description,
      manufacturerSnapshot: item.manufacturer,
      unitSnapshot: item.unit,
      vendorNameSnapshot: vendor?.name ?? null,
      position: l.position,
    });
  }
}
