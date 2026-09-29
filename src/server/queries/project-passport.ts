import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { drawingDisciplines, projectContacts, projectDisciplines, projectMilestones, user } from "@/db/schema";
import { requireSession } from "../auth-context";

export async function getProjectPassport(projectId: string) {
  await requireSession();
  const [contacts, disciplines, milestones] = await Promise.all([
    db
      .select({
        id: projectContacts.id,
        name: projectContacts.name,
        role: projectContacts.role,
        company: projectContacts.company,
        phone: projectContacts.phone,
        email: projectContacts.email,
      })
      .from(projectContacts)
      .where(eq(projectContacts.projectId, projectId))
      .orderBy(asc(projectContacts.position), asc(projectContacts.createdAt)),
    db
      .select({
        disciplineId: projectDisciplines.disciplineId,
        name: drawingDisciplines.name,
        leadUserId: projectDisciplines.leadUserId,
        leadName: user.name,
      })
      .from(projectDisciplines)
      .innerJoin(drawingDisciplines, eq(drawingDisciplines.id, projectDisciplines.disciplineId))
      .leftJoin(user, eq(user.id, projectDisciplines.leadUserId))
      .where(eq(projectDisciplines.projectId, projectId))
      .orderBy(asc(drawingDisciplines.position), asc(drawingDisciplines.name)),
    db
      .select({
        id: projectMilestones.id,
        name: projectMilestones.name,
        dueDate: projectMilestones.dueDate,
        doneAt: projectMilestones.doneAt,
      })
      .from(projectMilestones)
      .where(eq(projectMilestones.projectId, projectId))
      .orderBy(asc(projectMilestones.dueDate), asc(projectMilestones.createdAt)),
  ]);
  return { contacts, disciplines, milestones };
}

export type ProjectPassport = Awaited<ReturnType<typeof getProjectPassport>>;
export type ProjectContactRow = ProjectPassport["contacts"][number];
export type ProjectDisciplineRow = ProjectPassport["disciplines"][number];
export type ProjectMilestoneRow = ProjectPassport["milestones"][number];
