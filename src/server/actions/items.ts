"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { items } from "@/db/schema";
import { ItemInput, ItemPatch, type ItemInput as ItemInputType, type ItemPatch as ItemPatchType } from "@/lib/schemas/item";
import { getCurrentOrgId } from "../org";

export async function createItem(input: ItemInputType) {
  const data = ItemInput.parse(input);
  const orgId = await getCurrentOrgId();
  const [row] = await db.insert(items).values({ ...data, organizationId: orgId }).returning();
  revalidatePath("/catalog");
  return row;
}

export async function updateItem(input: ItemPatchType) {
  const { id, ...rest } = ItemPatch.parse(input);
  const orgId = await getCurrentOrgId();
  await db.update(items).set({ ...rest, updatedAt: new Date() }).where(and(eq(items.id, id), eq(items.organizationId, orgId)));
  revalidatePath("/catalog");
}

export async function deleteItem(input: { id: string }) {
  const orgId = await getCurrentOrgId();
  await db.delete(items).where(and(eq(items.id, input.id), eq(items.organizationId, orgId)));
  revalidatePath("/catalog");
}
