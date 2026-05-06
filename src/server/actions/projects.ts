"use server";

import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { projects, bomRevisions } from "@/db/schema";
import { ProjectInput, ProjectPatch, type ProjectInput as ProjectInputType, type ProjectPatch as ProjectPatchType } from "@/lib/schemas/project";
import { requireSession } from "../auth-context";
import { audit } from "../audit";

export async function createProject(input: ProjectInputType) {
  const data = ProjectInput.parse(input);
  const session = await requireSession();
  const project = await db.transaction(async tx => {
    const [created] = await tx.insert(projects).values({
      ...data,
      ownerId: data.ownerId ?? session.user.id,
      status: "draft",
    }).returning();
    await tx.insert(bomRevisions).values({ projectId: created.id, letter: "A", status: "draft" });
    return created;
  });
  revalidatePath("/builder");
  revalidatePath("/dashboard");
  revalidatePath("/projects");
  await audit({ kind: "bom.created", refType: "project", refId: project.id, summary: `${project.code} — ${project.name} created` });
  return project;
}

export async function updateProject(input: ProjectPatchType) {
  const { id, ...rest } = ProjectPatch.parse(input);
  await requireSession();
  await db.update(projects)
    .set({ ...rest, updatedAt: new Date() })
    .where(and(eq(projects.id, id), isNull(projects.deletedAt)));
  revalidatePath(`/builder/${id}`);
  revalidatePath("/dashboard");
  revalidatePath("/projects");
}

const IdInput = z.object({ id: z.string().min(1) });

export async function softDeleteProject(input: z.infer<typeof IdInput>) {
  const { id } = IdInput.parse(input);
  await requireSession();
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
  await requireSession();
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
