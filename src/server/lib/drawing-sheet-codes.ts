import "server-only";
import { and, eq, inArray, isNotNull, isNull, ne, notInArray } from "drizzle-orm";
import { db } from "@/db/client";
import { drawings } from "@/db/schema";

// Sheet codes (`drawing.sheet_code`, rules in src/lib/drawing-check-link.ts):
// unique within a project among live drawings. No session checks here.

type Db = Pick<typeof db, "select">;

/** The code of the live drawing in `projectId` that already has `sheetCode`, other than `exceptId`. */
export async function sheetCodeOwner(
  conn: Db,
  projectId: string,
  sheetCode: string,
  exceptId?: string,
): Promise<string | null> {
  const [d] = await conn
    .select({ code: drawings.code })
    .from(drawings)
    .where(and(
      eq(drawings.projectId, projectId),
      eq(drawings.sheetCode, sheetCode),
      isNull(drawings.deletedAt),
      ...(exceptId ? [ne(drawings.id, exceptId)] : []),
    ))
    .limit(1);
  return d?.code ?? null;
}

/**
 * Sheet codes of live drawings in these projects that aren't among `exceptIds`
 * — the bulk plan stops a file whose sheet belongs to an unselected drawing.
 */
export async function sheetCodesOutside(projectIds: string[], exceptIds: string[]) {
  if (!projectIds.length) return new Map<string, string>();
  const rows = await db
    .select({ projectId: drawings.projectId, sheetCode: drawings.sheetCode, code: drawings.code })
    .from(drawings)
    .where(and(
      inArray(drawings.projectId, projectIds),
      isNotNull(drawings.sheetCode),
      isNull(drawings.deletedAt),
      ...(exceptIds.length ? [notInArray(drawings.id, exceptIds)] : []),
    ));
  return new Map(rows.map(r => [sheetKey(r.projectId, r.sheetCode!), r.code]));
}

export const sheetKey = (projectId: string, sheetCode: string) => `${projectId}\u0000${sheetCode}`;
