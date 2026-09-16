import "server-only";
import { count, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { vendors } from "@/db/schema";
import { requireSession } from "../auth-context";
import { parseLeadTimeDays } from "../lib/lead-time";

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

  const leadRows = await db.select({ leadTime: vendors.leadTime }).from(vendors);
  const days = leadRows.map(v => parseLeadTimeDays(v.leadTime)).filter((n): n is number => n !== null);
  const avgLeadDays = days.length > 0
    ? Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10
    : 0;

  return { ...row, avgLeadDays };
}
