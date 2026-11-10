import "server-only";
import { and, eq, ilike, isNull, ne, sql } from "drizzle-orm";
import { db as defaultDb } from "@/db/client";
import { drawings, projects } from "@/db/schema";
import { DRAWING_CODE_FALLBACK, codePrefix, nextCode, projectCodeLetterOptions } from "@/lib/codes";

type Db = typeof defaultDb;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// Codes are never reused: archived projects and drawings keep theirs, so a new
// project can't be mistaken for an archived one in old emails, files or folders.

/**
 * Serialises project code assignment until the transaction ends, so two people
 * creating "Tegeta" at once don't both get 26TGT. Standard codes also have a
 * unique index (`project_code_std_uq`); this keeps the error a friendly one.
 */
export async function lockProjectCodes(tx: Tx) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('project-code'))`);
}

export async function lockDrawingCodes(tx: Tx, projectId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`drawing-code:${projectId}`}))`);
}

/** Whether any project — archived ones included — uses `code` (any case). */
export async function isProjectCodeTaken(client: Db | Tx, code: string, exceptId?: string) {
  const [hit] = await client
    .select({ id: projects.id })
    .from(projects)
    .where(and(sql`upper(${projects.code}) = upper(${code})`, exceptId ? ne(projects.id, exceptId) : undefined))
    .limit(1);
  return !!hit;
}

/** The first free `<year><letters>` for a name, trying the name's other letters when the obvious ones are taken. */
export async function freeProjectCode(client: Db | Tx, year: string, name: string): Promise<string | null> {
  const rows = await client
    .select({ code: projects.code })
    .from(projects)
    .where(ilike(projects.code, `${year}%`));
  const taken = new Set(rows.map(r => r.code.toUpperCase()));
  for (const letters of projectCodeLetterOptions(name)) {
    const code = `${year}${letters}`;
    if (!taken.has(code)) return code;
  }
  return null;
}

export async function nextDrawingCode(client: Db | Tx, projectId: string, name: string) {
  const prefix = codePrefix(name, DRAWING_CODE_FALLBACK);
  const rows = await client
    .select({ code: drawings.code })
    .from(drawings)
    .where(and(eq(drawings.projectId, projectId), ilike(drawings.code, `${prefix}-%`)));
  return nextCode(prefix, rows.map(r => r.code));
}

/** Whether a live drawing in the project already uses `code` (any case). */
export async function isDrawingCodeTaken(client: Db | Tx, projectId: string, code: string, exceptId?: string) {
  const [hit] = await client
    .select({ id: drawings.id })
    .from(drawings)
    .where(and(
      eq(drawings.projectId, projectId),
      sql`lower(${drawings.code}) = lower(${code})`,
      isNull(drawings.deletedAt),
      exceptId ? ne(drawings.id, exceptId) : undefined,
    ))
    .limit(1);
  return !!hit;
}

/**
 * The code a drawing has in `projectId`: its own when it is free there,
 * otherwise the next one from its name. Only a move to another project can
 * take a new code — renaming keeps it, since files and transmittals carry it.
 */
export async function drawingCodeInProject(
  client: Db | Tx,
  drawing: { id: string; code: string; name: string },
  projectId: string,
) {
  if (!(await isDrawingCodeTaken(client, projectId, drawing.code, drawing.id))) return drawing.code;
  return nextDrawingCode(client, projectId, drawing.name);
}
