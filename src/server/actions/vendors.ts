"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { vendors } from "@/db/schema";
import { VendorInput, VendorPatch, type VendorInput as VendorInputType, type VendorPatch as VendorPatchType } from "@/lib/schemas/vendor";
import { getCurrentOrgId } from "../org";
import { audit } from "../audit";

export async function createVendor(input: VendorInputType) {
  const data = VendorInput.parse(input);
  const orgId = await getCurrentOrgId();
  const [row] = await db.insert(vendors).values({ ...data, organizationId: orgId }).returning();
  revalidatePath("/vendors");
  await audit({ kind: "vendor.created", refType: "vendor", refId: row.id, summary: `Vendor ${row.name} added` });
  return row;
}

export async function updateVendor(input: VendorPatchType) {
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
