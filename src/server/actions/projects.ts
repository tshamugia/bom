"use server";

import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { projects } from "@/db/schema";
import { ProjectInput, ProjectPatch, type ProjectInput as ProjectInputType, type ProjectPatch as ProjectPatchType } from "@/lib/schemas/project";
import { EDITOR_ROLES } from "@/lib/roles";
import { requireRole } from "../auth-context";
import { audit } from "../audit";
import { lockProjectCodes, nextProjectCode } from "../lib/codes";

export async function createProject(input: ProjectInputType) {
  const data = ProjectInput.parse(input);
  const session = await requireRole(...EDITOR_ROLES);
  const project = await db.transaction(async tx => {
    await lockProjectCodes(tx);
    const [row] = await tx.insert(projects).values({
      ...data,
      code: await nextProjectCode(tx, data.name),
      clientName: data.clientName || null,
      ownerId: data.ownerId ?? session.user.id,
    }).returning();
    return row;
  });
  revalidatePath("/builder");
  revalidatePath("/dashboard");
  revalidatePath("/projects");
  await audit({
    kind: "bom.created",
    refType: "project",
    refId: project.id,
    summary: `${project.code} — ${project.name} created`,
  });
  return project;
}

const SuggestInput = z.object({ name: z.string().trim().max(200) });

/** The code a new project with this name would get — the New project dialog shows it before saving. */
export async function suggestProjectCode(input: z.infer<typeof SuggestInput>) {
  const { name } = SuggestInput.parse(input);
  await requireRole(...EDITOR_ROLES);
  return name ? nextProjectCode(db, name) : "";
}

export async function updateProject(input: ProjectPatchType) {
  const { id, ...rest } = ProjectPatch.parse(input);
  await requireRole(...EDITOR_ROLES);
  const [project] = await db.update(projects)
    .set({ ...rest, updatedAt: new Date() })
    .where(and(eq(projects.id, id), isNull(projects.deletedAt)))
    .returning({ code: projects.code });
  revalidatePath(`/projects/${id}`);
  revalidatePath("/dashboard");
  revalidatePath("/projects");
  if (project) {
    await audit({
      kind: "project.updated",
      refType: "project",
      refId: id,
      summary: `${project.code} updated — ${Object.keys(rest).join(", ")}`,
      payload: { projectId: id, changed: Object.keys(rest) },
    });
  }
}

const IdInput = z.object({ id: z.string().min(1) });

export async function softDeleteProject(input: z.infer<typeof IdInput>) {
  const { id } = IdInput.parse(input);
  await requireRole("admin");
  const [project] = await db.select({ code: projects.code, name: projects.name, deletedAt: projects.deletedAt })
    .from(projects).where(eq(projects.id, id)).limit(1);
  if (!project) throw new Error("PROJECT_NOT_FOUND");
  if (project.deletedAt) return;
  await db.update(projects).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(projects.id, id));
  revalidatePath("/projects");
  revalidatePath("/dashboard");
  await audit({
    kind: "project.deleted",
    refType: "project",
    refId: id,
    summary: `${project.code} — ${project.name} archived`,
  });
}

export async function restoreProject(input: z.infer<typeof IdInput>) {
  const { id } = IdInput.parse(input);
  await requireRole("admin");
  const [project] = await db.select({ code: projects.code, name: projects.name, deletedAt: projects.deletedAt })
    .from(projects).where(eq(projects.id, id)).limit(1);
  if (!project) throw new Error("PROJECT_NOT_FOUND");
  if (!project.deletedAt) return;
  await db.update(projects).set({ deletedAt: null, updatedAt: new Date() }).where(eq(projects.id, id));
  revalidatePath("/projects");
  revalidatePath("/dashboard");
  await audit({
    kind: "project.restored",
    refType: "project",
    refId: id,
    summary: `${project.code} — ${project.name} restored`,
  });
}
