import { pgTable, text, integer, timestamp, date, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createId } from "@paralleldrive/cuid2";
import { projects } from "./projects";
import { drawingDisciplines } from "./drawings";
import { user } from "./auth";

/** People to call about a project — the client's PM, the consultant, the site foreman… */
export const projectContacts = pgTable(
  "project_contact",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** e.g. "Client PM", "Site foreman". */
    role: text("role"),
    company: text("company"),
    phone: text("phone"),
    email: text("email"),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  t => ({
    projectIdx: index("project_contact_project_idx").on(t.projectId),
  }),
);

/** Disciplines in the project's scope, each with the engineer who leads it. */
export const projectDisciplines = pgTable(
  "project_discipline",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    disciplineId: text("discipline_id").notNull().references(() => drawingDisciplines.id, { onDelete: "cascade" }),
    leadUserId: text("lead_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  t => ({
    projectDisciplineUq: uniqueIndex("project_discipline_uq").on(t.projectId, t.disciplineId),
  }),
);

/** Key dates of a project beyond start and completion — design submission, handover… */
export const projectMilestones = pgTable(
  "project_milestone",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    dueDate: date("due_date").notNull(),
    /** Set when the milestone is reached; open milestones past their date are overdue. */
    doneAt: timestamp("done_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  t => ({
    projectDueIdx: index("project_milestone_project_due_idx").on(t.projectId, t.dueDate),
  }),
);
