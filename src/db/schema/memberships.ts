import { pgTable, text, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { organizations } from "./organizations";

export const memberships = pgTable(
  "membership",
  {
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  t => ({ pk: primaryKey({ columns: [t.userId, t.organizationId] }) }),
);
