import "server-only";
import { count, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { vendors } from "@/db/schema";
import { requireSession } from "../auth-context";

export async function listVendors() {
  await requireSession();
  return db
    .select()
    .from(vendors)
    .orderBy(vendors.name);
}

export async function vendorStats() {
  await requireSession();
  const [row] = await db
    .select({
      total: count(),
      preferred: sql<number>`COUNT(*) FILTER (WHERE ${vendors.status} = 'preferred')`.mapWith(Number),
      avgRating: sql<number>`COALESCE(AVG(${vendors.rating}), 0)`.mapWith(Number),
    })
    .from(vendors);
  return row;
}
