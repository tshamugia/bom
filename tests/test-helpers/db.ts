import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { user } from "@/db/schema";
import { createId } from "@paralleldrive/cuid2";

export async function resetDb() {
  await db.execute(sql`TRUNCATE "bom_line", "bom_section", "bom_revision", "project", "item", "subcategory", "category", "vendor", "audit_log", "session", "account", "verification", "user" RESTART IDENTITY CASCADE`);
}

export async function ensureUser(role: "owner" | "admin" | "member" = "owner") {
  const id = createId();
  const [u] = await db
    .insert(user)
    .values({
      id,
      name: "Test User",
      email: `test-${id}@example.com`,
      emailVerified: true,
      role,
    })
    .returning();
  return u;
}
