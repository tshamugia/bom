import "server-only";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { drawingCheckRuns, user } from "@/db/schema";
import { requireSession } from "../auth-context";
import { loadDrawingCheckEnabled } from "../lib/drawing-check-config";
import { dxfCheckerSetup } from "../lib/dxf-checker";

/** How many runs the card lists; the full findings come only for the latest finished one. */
const RUNS_SHOWN = 6;

/** What the drawing page's DXF check card shows. */
export async function getDrawingCheckPanel(drawingId: string) {
  await requireSession();
  const decider = alias(user, "decider");
  const [enabled, runs, [undoable]] = await Promise.all([
    loadDrawingCheckEnabled(),
    db
      .select({
        id: drawingCheckRuns.id,
        revisionId: drawingCheckRuns.revisionId,
        revisionLabel: drawingCheckRuns.revisionLabel,
        status: drawingCheckRuns.status,
        errorCode: drawingCheckRuns.errorCode,
        error: drawingCheckRuns.error,
        originalName: drawingCheckRuns.originalName,
        sizeBytes: drawingCheckRuns.sizeBytes,
        sha256: drawingCheckRuns.sha256,
        counts: drawingCheckRuns.counts,
        remarkChanges: drawingCheckRuns.remarkChanges,
        engineVersion: drawingCheckRuns.engineVersion,
        configVersion: drawingCheckRuns.configVersion,
        sheetCheck: drawingCheckRuns.sheetCheck,
        /** What the title block said the sheet is. */
        titleBlockSheet: sql<string | null>`${drawingCheckRuns.details} -> 'titleblock' -> 'values' ->> 'sheet_no'`,
        linkedSheetCode: drawingCheckRuns.linkedSheetCode,
        uploadedById: drawingCheckRuns.uploadedById,
        uploadedByName: user.name,
        decidedByName: decider.name,
        decidedAt: drawingCheckRuns.decidedAt,
        createdAt: drawingCheckRuns.createdAt,
        startedAt: drawingCheckRuns.startedAt,
        finishedAt: drawingCheckRuns.finishedAt,
      })
      .from(drawingCheckRuns)
      .leftJoin(user, eq(user.id, drawingCheckRuns.uploadedById))
      .leftJoin(decider, eq(decider.id, drawingCheckRuns.decidedById))
      .where(eq(drawingCheckRuns.drawingId, drawingId))
      .orderBy(desc(drawingCheckRuns.createdAt))
      .limit(RUNS_SHOWN),
    // "Wrong file" undoes only the latest run that changed Remarks.
    db
      .select({ id: drawingCheckRuns.id })
      .from(drawingCheckRuns)
      .where(and(eq(drawingCheckRuns.drawingId, drawingId), eq(drawingCheckRuns.status, "done"), isNotNull(drawingCheckRuns.appliedAt)))
      .orderBy(desc(drawingCheckRuns.appliedAt))
      .limit(1),
  ]);

  // A held run's findings are the report too: they say what confirming it would write.
  const lastDone = runs.find(r => r.status === "done" || r.status === "held");
  const [report] = lastDone
    ? await db
        .select({ findings: drawingCheckRuns.findings, details: drawingCheckRuns.details })
        .from(drawingCheckRuns)
        .where(eq(drawingCheckRuns.id, lastDone.id))
        .limit(1)
    : [];

  return {
    enabled,
    configured: dxfCheckerSetup() !== null,
    runs,
    /** The run "Wrong file" can undo; held runs can always be set aside. */
    undoableRunId: undoable?.id ?? null,
    report: lastDone && report
      ? { runId: lastDone.id, findings: report.findings ?? [], details: report.details ?? null }
      : null,
  };
}

export type DrawingCheckPanel = Awaited<ReturnType<typeof getDrawingCheckPanel>>;
export type DrawingCheckRunRow = DrawingCheckPanel["runs"][number];

export async function getDrawingCheckSettings() {
  await requireSession();
  return { enabled: await loadDrawingCheckEnabled(), configured: dxfCheckerSetup() !== null };
}
