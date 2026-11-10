"use server";

import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { projects } from "@/db/schema";
import {
  CodeLetters, CodeYear, ProjectInput, ProjectPatch,
  type ProjectInput as ProjectInputType, type ProjectPatch as ProjectPatchType,
} from "@/lib/schemas/project";
import { projectCodeLetters, projectCodeYear } from "@/lib/codes";
import { EDITOR_ROLES } from "@/lib/roles";
import { requireRole } from "../auth-context";
import { audit } from "../audit";
import { freeProjectCode, isProjectCodeTaken, lockProjectCodes } from "../lib/codes";

export async function createProject(input: ProjectInputType) {
  const { codeYear, codeLetters, ...data } = ProjectInput.parse(input);
  const session = await requireRole(...EDITOR_ROLES);
  const year = codeYear ?? projectCodeYear();
  const project = await db.transaction(async tx => {
    await lockProjectCodes(tx);
    let code: string | null;
    if (codeLetters) {
      // The creator chose these letters and saw them free; someone may have taken them since.
      code = `${year}${codeLetters}`;
      if (await isProjectCodeTaken(tx, code)) {
        throw new Error(`Project code ${code} is already used — choose other letters.`);
      }
    } else {
      code = await freeProjectCode(tx, year, data.name);
      if (!code) throw new Error("Every code from this name is taken — type the letters yourself.");
    }
    const [row] = await tx.insert(projects).values({
      ...data,
      code,
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

const CheckInput = z.object({
  name: z.string().trim().max(200),
  year: CodeYear.optional(),
  letters: CodeLetters.optional(),
});

export type ProjectCodeCheck = { code: string; taken: boolean; alternative: string | null };

/**
 * Whether the code the New project dialog shows is free — the letters typed,
 * or the ones suggested from the name — and a free one from the same name when not.
 */
export async function checkProjectCode(input: z.infer<typeof CheckInput>): Promise<ProjectCodeCheck | null> {
  const { name, year = projectCodeYear(), letters } = CheckInput.parse(input);
  await requireRole(...EDITOR_ROLES);
  if (!name && !letters) return null;
  const code = `${year}${letters ?? projectCodeLetters(name)}`;
  const taken = await isProjectCodeTaken(db, code);
  return { code, taken, alternative: taken ? await freeProjectCode(db, year, name) : null };
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
