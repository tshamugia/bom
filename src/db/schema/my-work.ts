import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * When each user last opened My work. Updates after it are marked new there
 * and counted on the bell; tasks are live state and never "read".
 */
export const myWorkSeen = pgTable("my_work_seen", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  seenAt: timestamp("seen_at").notNull().defaultNow(),
});
