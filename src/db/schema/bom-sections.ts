import { pgTable, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { bomRevisions } from "./bom-revisions";

export const bomSections = pgTable(
  "bom_section",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    revisionId: text("revision_id").notNull().references(() => bomRevisions.id, { onDelete: "cascade" }),
    sectionKey: text("section_key").notNull().$defaultFn(() => createId()),
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  t => ({
    revisionPosIdx: index("bom_section_revision_idx").on(t.revisionId, t.position),
    sectionKeyIdx: index("bom_section_key_idx").on(t.sectionKey),
  }),
);
