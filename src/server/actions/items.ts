"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { items } from "@/db/schema";
import { ItemInput, ItemPatch, type ItemInput as ItemInputType, type ItemPatch as ItemPatchType } from "@/lib/schemas/item";
import { EDITOR_ROLES } from "@/lib/roles";
import { requireRole } from "../auth-context";
import { audit } from "../audit";

export async function createItem(input: ItemInputType) {
  const data = ItemInput.parse(input);
  await requireRole(...EDITOR_ROLES);
  const [row] = await db.insert(items).values(data).returning();
  revalidatePath("/catalog");
  await audit({ kind: "item.created", refType: "item", refId: row.id, summary: `Item ${row.sku} added` });
  return row;
}

export async function updateItem(input: ItemPatchType) {
  const { id, ...rest } = ItemPatch.parse(input);
  await requireRole(...EDITOR_ROLES);
  const [row] = await db
    .update(items)
    .set({ ...rest, updatedAt: new Date() })
    .where(eq(items.id, id))
    .returning({ sku: items.sku });
  revalidatePath("/catalog");
  if (row) {
    await audit({ kind: "item.updated", refType: "item", refId: id, summary: `Item ${row.sku} updated`, payload: { fields: Object.keys(rest) } });
  }
}

export async function deleteItem(input: { id: string }) {
  await requireRole(...EDITOR_ROLES);
  const [row] = await db.delete(items).where(eq(items.id, input.id)).returning({ sku: items.sku, description: items.description });
  revalidatePath("/catalog");
  if (row) {
    await audit({ kind: "item.deleted", refType: "item", refId: input.id, summary: `Item ${row.sku} — ${row.description} deleted` });
  }
}
