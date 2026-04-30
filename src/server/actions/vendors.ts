"use server";

import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { vendors } from "@/db/schema";
import { getCurrentOrgId } from "../org";

export const VendorInput = z.object({
  name: z.string().min(1),
  code: z.string().min(1).max(8),
  country: z.string().min(2).max(2),
  leadTime: z.string().min(1),
  rating: z.number().min(0).max(5),
  status: z.enum(["preferred", "approved", "review"]),
});

export type VendorInput = z.infer<typeof VendorInput>;

export async function createVendor(input: VendorInput) {
  const data = VendorInput.parse(input);
  const orgId = await getCurrentOrgId();
  const [row] = await db.insert(vendors).values({ ...data, organizationId: orgId }).returning();
  revalidatePath("/vendors");
  return row;
}

export const VendorPatch = VendorInput.partial().extend({ id: z.string().min(1) });
export type VendorPatch = z.infer<typeof VendorPatch>;

export async function updateVendor(input: VendorPatch) {
  const { id, ...rest } = VendorPatch.parse(input);
  const orgId = await getCurrentOrgId();
  await db.update(vendors).set({ ...rest, updatedAt: new Date() }).where(and(eq(vendors.id, id), eq(vendors.organizationId, orgId)));
  revalidatePath("/vendors");
}

export async function deleteVendor(input: { id: string }) {
  const orgId = await getCurrentOrgId();
  await db.delete(vendors).where(and(eq(vendors.id, input.id), eq(vendors.organizationId, orgId)));
  revalidatePath("/vendors");
}
