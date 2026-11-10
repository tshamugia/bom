import "server-only";
import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { db } from "@/db/client";
import {
  DRAWING_CHECK_CONFIG_ID, SYSTEM_SETTINGS_ID, drawingCheckConfig, drawingCheckRuns, systemSettings,
} from "@/db/schema";
import {
  PENDING_STALE_MS, QUEUED_STALE_MS, STALE_RUN_ERROR, parseCheckRulesConfig, type CheckRulesConfig,
} from "@/lib/drawing-checks";
import { deleteObject } from "@/lib/s3";

// No session checks here — callers (actions, queries, the callback route) have done them.

/** The admin switch in Settings → Drawings; off until checks were tried on real drawings. */
export async function loadDrawingCheckEnabled(): Promise<boolean> {
  const [row] = await db
    .select({ enabled: systemSettings.drawingCheckEnabled })
    .from(systemSettings)
    .where(eq(systemSettings.id, SYSTEM_SETTINGS_ID))
    .limit(1);
  return row?.enabled ?? false;
}

export type DrawingCheckConfig = { version: number; rules: CheckRulesConfig; params: Record<string, unknown> };

/** Rules and parameters for the next run. No row yet: every rule on, the checker's defaults, version 0. */
export async function loadDrawingCheckConfig(): Promise<DrawingCheckConfig> {
  const [row] = await db
    .select({ version: drawingCheckConfig.version, rules: drawingCheckConfig.rules, params: drawingCheckConfig.params })
    .from(drawingCheckConfig)
    .where(eq(drawingCheckConfig.id, DRAWING_CHECK_CONFIG_ID))
    .limit(1);
  return {
    version: row?.version ?? 0,
    rules: parseCheckRulesConfig(row?.rules),
    params: row?.params && typeof row.params === "object" ? row.params : {},
  };
}

/**
 * Frees revisions held by runs that will never finish: uploads abandoned in the
 * browser are forgotten, checks the checker lost (a restart empties its queue)
 * fail. Their DXFs leave the bucket. Remarks don't change.
 */
export async function closeStaleCheckRuns(now: Date = new Date()): Promise<void> {
  const abandoned = await db
    .delete(drawingCheckRuns)
    .where(and(eq(drawingCheckRuns.status, "pending"), lt(drawingCheckRuns.createdAt, new Date(now.getTime() - PENDING_STALE_MS))))
    .returning({ objectKey: drawingCheckRuns.objectKey });
  const queuedBefore = new Date(now.getTime() - QUEUED_STALE_MS);
  const lost = await db
    .update(drawingCheckRuns)
    .set({ status: "failed", errorCode: "STALE", error: STALE_RUN_ERROR, finishedAt: now })
    .where(and(
      eq(drawingCheckRuns.status, "queued"),
      or(
        lt(drawingCheckRuns.startedAt, queuedBefore),
        and(isNull(drawingCheckRuns.startedAt), lt(drawingCheckRuns.createdAt, queuedBefore)),
      ),
    ))
    .returning({ objectKey: drawingCheckRuns.objectKey });
  await deleteCheckFiles([...abandoned, ...lost].map(r => r.objectKey));
}

/** The DXF is only kept until its check is over; a failed delete is logged, never thrown. */
export async function deleteCheckFiles(keys: string[]): Promise<void> {
  const results = await Promise.allSettled(keys.map(k => deleteObject(k)));
  results.forEach((r, i) => {
    if (r.status === "rejected") console.error("[drawing-checks] couldn't delete", keys[i], r.reason);
  });
}

/** Runs still uploading or checking on these revisions. */
export async function activeCheckRevisionIds(revisionIds: string[]): Promise<Set<string>> {
  if (!revisionIds.length) return new Set();
  const rows = await db
    .select({ revisionId: drawingCheckRuns.revisionId })
    .from(drawingCheckRuns)
    .where(and(inArray(drawingCheckRuns.revisionId, revisionIds), inArray(drawingCheckRuns.status, ["pending", "queued"])));
  return new Set(rows.map(r => r.revisionId));
}
