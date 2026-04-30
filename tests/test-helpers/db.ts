import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations } from "@/db/schema";
import { createId } from "@paralleldrive/cuid2";

export async function resetDb() {
  await db.execute(sql`TRUNCATE "item", "subcategory", "category", "vendor", "membership", "organization", "session", "account", "verification", "user" RESTART IDENTITY CASCADE`);
}

export async function ensureOrg(name = "Test Org") {
  const slug = `test-${createId().slice(0, 6)}`;
  const [org] = await db.insert(organizations).values({ name, slug }).returning();
  return org;
}
