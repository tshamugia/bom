import "server-only";
import { asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { drawingCheckRuns, drawingCheckWaivers, drawings, projects, user } from "@/db/schema";
import { requireSession } from "../auth-context";
import { loadCheckExceptions, loadDrawingCheckConfig, loadDrawingCheckEnabled } from "../lib/drawing-check-config";
import { dxfCheckerSetup } from "../lib/dxf-checker";

/** How many runs the card lists; the full findings come only for the latest finished one. */
const RUNS_SHOWN = 6;

/** What the drawing page's DXF check card shows. */
export async function getDrawingCheckPanel(drawingId: string) {
  await requireSession();
  const [enabled, exceptions, waivers, runs] = await Promise.all([
    loadDrawingCheckEnabled(),
    loadCheckExceptions(drawingId),
    listCheckWaivers(drawingId),
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
        uploadedByName: user.name,
        createdAt: drawingCheckRuns.createdAt,
        startedAt: drawingCheckRuns.startedAt,
        finishedAt: drawingCheckRuns.finishedAt,
      })
      .from(drawingCheckRuns)
      .leftJoin(user, eq(user.id, drawingCheckRuns.uploadedById))
      .where(eq(drawingCheckRuns.drawingId, drawingId))
      .orderBy(desc(drawingCheckRuns.createdAt))
      .limit(RUNS_SHOWN),
  ]);

  const lastDone = runs.find(r => r.status === "done");
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
    clientNaming: exceptions.clientNaming,
    waivers,
    runs,
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

/** Rules marked as a false error — on one drawing, or everywhere for Settings. */
async function listCheckWaivers(drawingId?: string) {
  return db
    .select({
      id: drawingCheckWaivers.id,
      ruleId: drawingCheckWaivers.ruleId,
      reason: drawingCheckWaivers.reason,
      createdAt: drawingCheckWaivers.createdAt,
      createdByName: user.name,
      drawingId: drawings.id,
      drawingCode: drawings.code,
      projectCode: projects.code,
    })
    .from(drawingCheckWaivers)
    .innerJoin(drawings, eq(drawings.id, drawingCheckWaivers.drawingId))
    .innerJoin(projects, eq(projects.id, drawings.projectId))
    .leftJoin(user, eq(user.id, drawingCheckWaivers.createdById))
    .where(drawingId ? eq(drawingCheckWaivers.drawingId, drawingId) : isNull(drawings.deletedAt))
    .orderBy(asc(projects.code), asc(drawings.code), asc(drawingCheckWaivers.ruleId));
}

export type CheckWaiverRow = Awaited<ReturnType<typeof listCheckWaivers>>[number];

/** Settings → Drawings → DXF check settings (admins; the page checks the role). */
export async function getDrawingCheckSettingsPage() {
  await requireSession();
  const [enabled, config, projectRows, waivers] = await Promise.all([
    loadDrawingCheckEnabled(),
    loadDrawingCheckConfig(),
    db
      .select({ id: projects.id, code: projects.code, name: projects.name, clientNaming: projects.checkClientNaming })
      .from(projects)
      .where(isNull(projects.deletedAt))
      .orderBy(asc(projects.code)),
    listCheckWaivers(),
  ]);
  return { enabled, configured: dxfCheckerSetup() !== null, config, projects: projectRows, waivers };
}

export type DrawingCheckSettingsPage = Awaited<ReturnType<typeof getDrawingCheckSettingsPage>>;
