import "server-only";
import { and, eq, ilike, isNull, ne, sql } from "drizzle-orm";
import { db as defaultDb } from "@/db/client";
import { drawings, projects } from "@/db/schema";
import { DRAWING_CODE_FALLBACK, PROJECT_CODE_FALLBACK, codePrefix, nextCode } from "@/lib/codes";

type Db = typeof defaultDb;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// Numbers are never reused: archived projects and drawings keep theirs, so a
// new `BMW-003` can't be mistaken for the archived one in old emails or files.

/**
 * Serialises code assignment until the transaction ends, so two people
 * creating "BMW" at once don't both get BMW-001 (project codes have no unique index).
 */
export async function lockProjectCodes(tx: Tx) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('project-code'))`);
}

export async function lockDrawingCodes(tx: Tx, projectId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`drawing-code:${projectId}`}))`);
}

export async function nextProjectCode(client: Db | Tx, name: string) {
  const prefix = codePrefix(name, PROJECT_CODE_FALLBACK);
  const rows = await client
    .select({ code: projects.code })
    .from(projects)
    .where(ilike(projects.code, `${prefix}-%`));
  return nextCode(prefix, rows.map(r => r.code));
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
