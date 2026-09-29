"use server";

import { z } from "zod";
import { and, eq, inArray, isNull, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import {
  drawingDisciplines,
  projectContacts,
  projectDisciplines,
  projectMilestones,
  projects,
  user,
} from "@/db/schema";
import {
  ProjectContactInput,
  ProjectMilestoneInput,
  ProjectPassportInput,
} from "@/lib/schemas/project";
import { READ_ONLY_ERROR, canEdit } from "@/lib/roles";
import { requireSession } from "../auth-context";
import { audit } from "../audit";
import type { DrawingActionResult as ActionResult } from "./drawings";

const fail = (error: string) => ({ ok: false as const, error });
const Id = z.string().min(1);

async function findProject(id: string) {
  const [p] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), isNull(projects.deletedAt)))
    .limit(1);
  return p ?? null;
}

function revalidateProject(id: string) {
  revalidatePath(`/projects/${id}`);
  revalidatePath("/projects");
  revalidatePath("/dashboard");
}

const blank = (s: string | null) => (s && s.trim() ? s.trim() : null);

export async function saveProjectPassport(input: ProjectPassportInput): Promise<ActionResult> {
  const data = ProjectPassportInput.parse(input);
  if (!canEdit((await requireSession()).user)) return fail(READ_ONLY_ERROR);
  const current = await findProject(data.id);
  if (!current) return fail("Project not found.");
  if (data.startDate && data.targetDate && data.startDate > data.targetDate) {
    return fail("The start date is after the completion date.");
  }
  if (data.ownerId) {
    const [owner] = await db
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.id, data.ownerId), eq(user.disabled, false)))
      .limit(1);
    if (!owner) return fail("The project manager must be an active user.");
  }

  const next = {
    code: data.code,
    name: data.name,
    ownerId: data.ownerId,
    clientName: blank(data.clientName),
    contractNo: blank(data.contractNo),
    siteAddress: blank(data.siteAddress),
    description: blank(data.description),
    startDate: data.startDate,
    targetDate: data.targetDate,
  };
  const labels: Record<keyof typeof next, string> = {
    code: "code",
    name: "name",
    ownerId: "manager",
    clientName: "client",
    contractNo: "contract",
    siteAddress: "site",
    description: "description",
    startDate: "start date",
    targetDate: "completion date",
  };
  const changed = (Object.keys(next) as Array<keyof typeof next>).filter(k => (current[k] ?? null) !== next[k]);
  if (changed.length === 0) return { ok: true };

  await db.update(projects).set({ ...next, updatedAt: new Date() }).where(eq(projects.id, data.id));

  revalidateProject(data.id);
  revalidatePath("/builder");
  await audit({
    kind: "project.updated",
    refType: "project",
    refId: data.id,
    summary: `${next.code} passport updated — ${changed.map(k => labels[k]).join(", ")}`,
    payload: { projectId: data.id, changed },
  });
  return { ok: true };
}

// ── Contacts ─────────────────────────────────────────

export async function addProjectContact(
  input: { projectId: string } & ProjectContactInput,
): Promise<ActionResult> {
  const projectId = Id.parse(input.projectId);
  const data = ProjectContactInput.parse(input);
  if (!canEdit((await requireSession()).user)) return fail(READ_ONLY_ERROR);
  const project = await findProject(projectId);
  if (!project) return fail("Project not found.");

  const [{ last }] = await db
    .select({ last: max(projectContacts.position) })
    .from(projectContacts)
    .where(eq(projectContacts.projectId, projectId));
  await db.insert(projectContacts).values({
    projectId,
    name: data.name,
    role: blank(data.role),
    company: blank(data.company),
    phone: blank(data.phone),
    email: blank(data.email),
    position: (last ?? -1) + 1,
  });

  revalidateProject(projectId);
  await audit({
    kind: "project.contact.changed",
    refType: "project",
    refId: projectId,
    summary: `${project.code}: contact ${data.name} added`,
    payload: { projectId },
  });
  return { ok: true };
}

async function findContact(id: string) {
  const [c] = await db
    .select({ id: projectContacts.id, name: projectContacts.name, projectId: projects.id, code: projects.code })
    .from(projectContacts)
    .innerJoin(projects, eq(projects.id, projectContacts.projectId))
    .where(and(eq(projectContacts.id, id), isNull(projects.deletedAt)))
    .limit(1);
  return c ?? null;
}

export async function updateProjectContact(input: { id: string } & ProjectContactInput): Promise<ActionResult> {
  const id = Id.parse(input.id);
  const data = ProjectContactInput.parse(input);
  if (!canEdit((await requireSession()).user)) return fail(READ_ONLY_ERROR);
  const contact = await findContact(id);
  if (!contact) return fail("Contact not found.");

  await db
    .update(projectContacts)
    .set({
      name: data.name,
      role: blank(data.role),
      company: blank(data.company),
      phone: blank(data.phone),
      email: blank(data.email),
    })
    .where(eq(projectContacts.id, id));

  revalidateProject(contact.projectId);
  await audit({
    kind: "project.contact.changed",
    refType: "project",
    refId: contact.projectId,
    summary: `${contact.code}: contact ${data.name} updated`,
    payload: { projectId: contact.projectId, contactId: id },
  });
  return { ok: true };
}

export async function deleteProjectContact(input: { id: string }): Promise<ActionResult> {
  const id = Id.parse(input.id);
  if (!canEdit((await requireSession()).user)) return fail(READ_ONLY_ERROR);
  const contact = await findContact(id);
  if (!contact) return fail("Contact not found.");

  await db.delete(projectContacts).where(eq(projectContacts.id, id));

  revalidateProject(contact.projectId);
  await audit({
    kind: "project.contact.changed",
    refType: "project",
    refId: contact.projectId,
    summary: `${contact.code}: contact ${contact.name} removed`,
    payload: { projectId: contact.projectId, contactId: id },
  });
  return { ok: true };
}

// ── Disciplines ──────────────────────────────────────

const DisciplinesInput = z.object({
  projectId: Id,
  items: z
    .array(z.object({ disciplineId: Id, leadUserId: Id.nullable() }))
    .max(100),
});

/** Replaces the project's disciplines and their lead engineers in one go. */
export async function setProjectDisciplines(input: z.infer<typeof DisciplinesInput>): Promise<ActionResult> {
  const { projectId, items } = DisciplinesInput.parse(input);
  if (!canEdit((await requireSession()).user)) return fail(READ_ONLY_ERROR);
  const project = await findProject(projectId);
  if (!project) return fail("Project not found.");

  const unique = [...new Map(items.map(i => [i.disciplineId, i])).values()];
  const disciplineIds = unique.map(i => i.disciplineId);
  const found = disciplineIds.length
    ? await db
        .select({ id: drawingDisciplines.id, name: drawingDisciplines.name })
        .from(drawingDisciplines)
        .where(inArray(drawingDisciplines.id, disciplineIds))
    : [];
  if (found.length !== disciplineIds.length) return fail("A discipline no longer exists — refresh the page.");

  const leadIds = [...new Set(unique.map(i => i.leadUserId).filter((x): x is string => !!x))];
  const leads = leadIds.length
    ? await db.select({ id: user.id }).from(user).where(and(inArray(user.id, leadIds), eq(user.disabled, false)))
    : [];
  if (leads.length !== leadIds.length) return fail("Lead engineers must be active users.");

  await db.transaction(async tx => {
    await tx.delete(projectDisciplines).where(eq(projectDisciplines.projectId, projectId));
    if (unique.length) {
      await tx.insert(projectDisciplines).values(unique.map(i => ({ projectId, ...i })));
    }
  });

  revalidateProject(projectId);
  await audit({
    kind: "project.disciplines.changed",
    refType: "project",
    refId: projectId,
    summary: `${project.code} disciplines: ${found.map(d => d.name).join(", ") || "none"}`,
    payload: { projectId, items: unique },
  });
  return { ok: true };
}

// ── Milestones ───────────────────────────────────────

export async function addProjectMilestone(
  input: { projectId: string } & ProjectMilestoneInput,
): Promise<ActionResult> {
  const projectId = Id.parse(input.projectId);
  const data = ProjectMilestoneInput.parse(input);
  if (!canEdit((await requireSession()).user)) return fail(READ_ONLY_ERROR);
  const project = await findProject(projectId);
  if (!project) return fail("Project not found.");

  await db.insert(projectMilestones).values({ projectId, name: data.name, dueDate: data.dueDate });

  revalidateProject(projectId);
  await audit({
    kind: "project.milestone.changed",
    refType: "project",
    refId: projectId,
    summary: `${project.code}: milestone “${data.name}” added for ${data.dueDate}`,
    payload: { projectId },
  });
  return { ok: true };
}

async function findMilestone(id: string) {
  const [m] = await db
    .select({
      id: projectMilestones.id,
      name: projectMilestones.name,
      doneAt: projectMilestones.doneAt,
      projectId: projects.id,
      code: projects.code,
    })
    .from(projectMilestones)
    .innerJoin(projects, eq(projects.id, projectMilestones.projectId))
    .where(and(eq(projectMilestones.id, id), isNull(projects.deletedAt)))
    .limit(1);
  return m ?? null;
}

export async function updateProjectMilestone(input: { id: string } & ProjectMilestoneInput): Promise<ActionResult> {
  const id = Id.parse(input.id);
  const data = ProjectMilestoneInput.parse(input);
  if (!canEdit((await requireSession()).user)) return fail(READ_ONLY_ERROR);
  const m = await findMilestone(id);
  if (!m) return fail("Milestone not found.");

  await db.update(projectMilestones).set({ name: data.name, dueDate: data.dueDate }).where(eq(projectMilestones.id, id));

  revalidateProject(m.projectId);
  await audit({
    kind: "project.milestone.changed",
    refType: "project",
    refId: m.projectId,
    summary: `${m.code}: milestone “${data.name}” moved to ${data.dueDate}`,
    payload: { projectId: m.projectId, milestoneId: id },
  });
  return { ok: true };
}

export async function setProjectMilestoneDone(input: { id: string; done: boolean }): Promise<ActionResult> {
  const id = Id.parse(input.id);
  const done = z.boolean().parse(input.done);
  if (!canEdit((await requireSession()).user)) return fail(READ_ONLY_ERROR);
  const m = await findMilestone(id);
  if (!m) return fail("Milestone not found.");
  if (!!m.doneAt === done) return { ok: true };

  await db.update(projectMilestones).set({ doneAt: done ? new Date() : null }).where(eq(projectMilestones.id, id));

  revalidateProject(m.projectId);
  await audit({
    kind: "project.milestone.changed",
    refType: "project",
    refId: m.projectId,
    summary: `${m.code}: milestone “${m.name}” ${done ? "reached" : "reopened"}`,
    payload: { projectId: m.projectId, milestoneId: id, done },
  });
  return { ok: true };
}

export async function deleteProjectMilestone(input: { id: string }): Promise<ActionResult> {
  const id = Id.parse(input.id);
  if (!canEdit((await requireSession()).user)) return fail(READ_ONLY_ERROR);
  const m = await findMilestone(id);
  if (!m) return fail("Milestone not found.");

  await db.delete(projectMilestones).where(eq(projectMilestones.id, id));

  revalidateProject(m.projectId);
  await audit({
    kind: "project.milestone.changed",
    refType: "project",
    refId: m.projectId,
    summary: `${m.code}: milestone “${m.name}” removed`,
    payload: { projectId: m.projectId, milestoneId: id },
  });
  return { ok: true };
}
