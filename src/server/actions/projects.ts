"use server";

import { eq } from "drizzle-orm";
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
    const [created] = await tx.insert(projects).values({ ...data, ownerId: session.user.id, status: "draft" }).returning();
    await tx.insert(bomRevisions).values({ projectId: created.id, letter: "A", status: "draft" });
    return created;
  });
  revalidatePath("/builder");
  revalidatePath("/dashboard");
  await audit({ kind: "bom.created", refType: "project", refId: project.id, summary: `${project.code} — ${project.name} created` });
  return project;
}

export async function updateProject(input: ProjectPatchType) {
  const { id, ...rest } = ProjectPatch.parse(input);
  await requireSession();
  await db.update(projects).set({ ...rest, updatedAt: new Date() }).where(eq(projects.id, id));
  revalidatePath(`/builder/${id}`);
  revalidatePath("/dashboard");
}
