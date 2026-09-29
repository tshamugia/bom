"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { vendors } from "@/db/schema";
import { VendorInput, VendorPatch, type VendorInput as VendorInputType, type VendorPatch as VendorPatchType } from "@/lib/schemas/vendor";
import { EDITOR_ROLES } from "@/lib/roles";
import { requireRole } from "../auth-context";
import { audit } from "../audit";

export async function createVendor(input: VendorInputType) {
  const data = VendorInput.parse(input);
  await requireRole(...EDITOR_ROLES);
  const [row] = await db.insert(vendors).values(data).returning();
  revalidatePath("/vendors");
  await audit({ kind: "vendor.created", refType: "vendor", refId: row.id, summary: `Vendor ${row.name} added` });
  return row;
}

export async function updateVendor(input: VendorPatchType) {
  const { id, ...rest } = VendorPatch.parse(input);
  await requireRole(...EDITOR_ROLES);
  const [row] = await db
    .update(vendors)
    .set({ ...rest, updatedAt: new Date() })
    .where(eq(vendors.id, id))
    .returning({ name: vendors.name });
  revalidatePath("/vendors");
  if (row) {
    await audit({ kind: "vendor.updated", refType: "vendor", refId: id, summary: `Vendor ${row.name} updated`, payload: { fields: Object.keys(rest) } });
  }
}

export async function deleteVendor(input: { id: string }) {
  await requireRole("admin");
  const [row] = await db.delete(vendors).where(eq(vendors.id, input.id)).returning({ name: vendors.name });
  revalidatePath("/vendors");
  if (row) {
    await audit({ kind: "vendor.deleted", refType: "vendor", refId: input.id, summary: `Vendor ${row.name} deleted` });
  }
}
