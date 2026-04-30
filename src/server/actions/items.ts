"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { items } from "@/db/schema";
import { getCurrentOrgId } from "../org";

export const ItemInput = z.object({
  sku: z.string().min(1).max(64),
  description: z.string().min(1),
  manufacturer: z.string().min(1),
  unit: z.string().min(1),
  unitPrice: z.string().regex(/^\d+(\.\d+)?$/),
  onHand: z.number().int().nonnegative(),
  stockState: z.enum(["in-stock", "low-stock", "backorder", "out-of-stock"]),
  vendorId: z.string().nullable(),
  categoryId: z.string().nullable(),
  subcategoryId: z.string().nullable(),
});

export type ItemInput = z.infer<typeof ItemInput>;

export async function createItem(input: ItemInput) {
  const data = ItemInput.parse(input);
  const orgId = await getCurrentOrgId();
  const [row] = await db.insert(items).values({ ...data, organizationId: orgId }).returning();
  revalidatePath("/catalog");
  return row;
}

export const ItemPatch = ItemInput.partial().extend({ id: z.string().min(1) });
export async function updateItem(input: z.infer<typeof ItemPatch>) {
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
