import { pgTable, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { projects } from "./projects";
import { user } from "./auth";

export const boms = pgTable(
  "bom",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    ownerId: text("owner_id").references(() => user.id, { onDelete: "set null" }),
    deletedAt: timestamp("deleted_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  t => ({
    projectIdx: index("bom_project_idx").on(t.projectId),
    projectNameUq: uniqueIndex("bom_project_name_uq").on(t.projectId, t.name),
    deletedAtIdx: index("bom_deleted_at_idx").on(t.deletedAt),
  }),
);
