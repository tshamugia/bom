"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { items } from "@/db/schema";
import { ItemInput, ItemPatch, type ItemInput as ItemInputType, type ItemPatch as ItemPatchType } from "@/lib/schemas/item";
import { requireSession } from "../auth-context";
import { audit } from "../audit";

export async function createItem(input: ItemInputType) {
  const data = ItemInput.parse(input);
  await requireSession();
  const [row] = await db.insert(items).values(data).returning();
  revalidatePath("/catalog");
  await audit({ kind: "item.created", refType: "item", refId: row.id, summary: `Item ${row.sku} added` });
  return row;
}

export async function updateItem(input: ItemPatchType) {
  const { id, ...rest } = ItemPatch.parse(input);
  await requireSession();
  await db.update(items).set({ ...rest, updatedAt: new Date() }).where(eq(items.id, id));
  revalidatePath("/catalog");
}

export async function deleteItem(input: { id: string }) {
  await requireSession();
  await db.delete(items).where(eq(items.id, input.id));
  revalidatePath("/catalog");
}
