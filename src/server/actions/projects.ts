"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { projects, bomRevisions } from "@/db/schema";
import { ProjectInput, ProjectPatch, type ProjectInput as ProjectInputType, type ProjectPatch as ProjectPatchType } from "@/lib/schemas/project";
import { getCurrentOrgId } from "../org";

export async function createProject(input: ProjectInputType) {
  const data = ProjectInput.parse(input);
  const orgId = await getCurrentOrgId();
  const [project] = await db.insert(projects).values({ ...data, organizationId: orgId, status: "draft" }).returning();
  await db.insert(bomRevisions).values({ projectId: project.id, letter: "A", status: "draft" });
  revalidatePath("/builder");
  revalidatePath("/dashboard");
  return project;
}

export async function updateProject(input: ProjectPatchType) {
  const { id, ...rest } = ProjectPatch.parse(input);
  const orgId = await getCurrentOrgId();
  await db.update(projects).set({ ...rest, updatedAt: new Date() }).where(and(eq(projects.id, id), eq(projects.organizationId, orgId)));
  revalidatePath(`/builder/${id}`);
  revalidatePath("/dashboard");
}
