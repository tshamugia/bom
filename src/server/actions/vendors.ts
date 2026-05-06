"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { vendors } from "@/db/schema";
import { VendorInput, VendorPatch, type VendorInput as VendorInputType, type VendorPatch as VendorPatchType } from "@/lib/schemas/vendor";
import { requireSession } from "../auth-context";
import { audit } from "../audit";

export async function createVendor(input: VendorInputType) {
  const data = VendorInput.parse(input);
  await requireSession();
  const [row] = await db.insert(vendors).values(data).returning();
  revalidatePath("/vendors");
  await audit({ kind: "vendor.created", refType: "vendor", refId: row.id, summary: `Vendor ${row.name} added` });
  return row;
}

export async function updateVendor(input: VendorPatchType) {
  const { id, ...rest } = VendorPatch.parse(input);
  await requireSession();
  await db.update(vendors).set({ ...rest, updatedAt: new Date() }).where(eq(vendors.id, id));
  revalidatePath("/vendors");
}

export async function deleteVendor(input: { id: string }) {
  await requireSession();
  await db.delete(vendors).where(eq(vendors.id, input.id));
  revalidatePath("/vendors");
}
