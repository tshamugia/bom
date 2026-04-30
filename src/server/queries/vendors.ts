import "server-only";
import { count, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { vendors } from "@/db/schema";
import { getCurrentOrgId } from "../org";

export async function listVendors() {
  const orgId = await getCurrentOrgId();
  return db
    .select()
    .from(vendors)
    .where(eq(vendors.organizationId, orgId))
    .orderBy(vendors.name);
}

export async function vendorStats() {
  const orgId = await getCurrentOrgId();
  const [row] = await db
    .select({
      total: count(),
      preferred: sql<number>`COUNT(*) FILTER (WHERE ${vendors.status} = 'preferred')`.mapWith(Number),
      avgRating: sql<number>`COALESCE(AVG(${vendors.rating}), 0)`.mapWith(Number),
    })
    .from(vendors)
    .where(eq(vendors.organizationId, orgId));
  return row;
}
