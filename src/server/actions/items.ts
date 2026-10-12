"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { items } from "@/db/schema";
import { ItemInput, ItemPatch, type ItemInput as ItemInputType, type ItemPatch as ItemPatchType } from "@/lib/schemas/item";
import { EDITOR_ROLES, READ_ONLY_ERROR, canEdit } from "@/lib/roles";
import { requireRole, requireSession } from "../auth-context";
import { audit } from "../audit";

export type ItemActionResult = { ok: true; id: string } | { ok: false; error: string };

const fail = (error: string): ItemActionResult => ({ ok: false, error });

async function skuTaken(sku: string, exceptId?: string) {
  const [row] = await db
    .select({ id: items.id })
    .from(items)
    .where(exceptId ? and(eq(items.sku, sku), ne(items.id, exceptId)) : eq(items.sku, sku))
    .limit(1);
  return Boolean(row);
}

export async function createItem(input: ItemInputType): Promise<ItemActionResult> {
  const data = ItemInput.parse(input);
  const session = await requireSession();
  if (!canEdit(session.user)) return fail(READ_ONLY_ERROR);
  if (await skuTaken(data.sku)) return fail(`SKU ${data.sku} is already in the catalog.`);

  const [row] = await db.insert(items).values(data).returning();
  revalidatePath("/catalog");
  await audit({ kind: "item.created", refType: "item", refId: row.id, summary: `Item ${row.sku} added` });
  return { ok: true, id: row.id };
}

/**
 * Edits a catalog item. BOM lines keep the SKU, description, unit and vendor
 * they were added with (snapshots), so existing BOMs don't change.
 */
export async function updateItem(input: ItemPatchType): Promise<ItemActionResult> {
  const { id, ...patch } = ItemPatch.parse(input);
  const session = await requireSession();
  if (!canEdit(session.user)) return fail(READ_ONLY_ERROR);

  const [current] = await db.select().from(items).where(eq(items.id, id)).limit(1);
  if (!current) return fail("Item not found.");
  if (patch.sku !== undefined && patch.sku !== current.sku && (await skuTaken(patch.sku, id))) {
    return fail(`SKU ${patch.sku} is already used by another item.`);
  }
  // A subcategory belongs to its category: moving the item drops it.
  if (patch.categoryId !== undefined && patch.categoryId !== current.categoryId && patch.subcategoryId === undefined) {
    patch.subcategoryId = null;
  }

  const changed = (Object.keys(patch) as (keyof typeof patch)[]).filter(k => patch[k] !== undefined && patch[k] !== current[k]);
  if (changed.length === 0) return { ok: true, id };

  await db
    .update(items)
    .set({ ...Object.fromEntries(changed.map(k => [k, patch[k]])), updatedAt: new Date() })
    .where(eq(items.id, id));
  revalidatePath("/catalog");
  const sku = patch.sku ?? current.sku;
  await audit({
    kind: "item.updated",
    refType: "item",
    refId: id,
    summary: sku !== current.sku ? `Item ${current.sku} → ${sku} updated` : `Item ${sku} updated`,
    payload: { fields: changed },
  });
  return { ok: true, id };
}

export async function deleteItem(input: { id: string }) {
  await requireRole(...EDITOR_ROLES);
  const [row] = await db.delete(items).where(eq(items.id, input.id)).returning({ sku: items.sku, description: items.description });
  revalidatePath("/catalog");
  if (row) {
    await audit({ kind: "item.deleted", refType: "item", refId: input.id, summary: `Item ${row.sku} — ${row.description} deleted` });
  }
}
