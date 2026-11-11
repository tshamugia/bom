import "server-only";
import { z } from "zod";
import { and, eq, gt, inArray, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { drawingCheckRuns, drawingEvents, drawingRemarks, drawingRevisions, drawings } from "@/db/schema";
import type { DrawingCheckRemarkChanges } from "@/db/schema";
import { CHECK_RULE_IDS, CHECK_SEVERITIES, type CheckSeverity } from "@/lib/drawing-check-rules";
import {
  countFindings, describeCounts, describeRemarkChanges, planRemarkChanges, suppressedCheckRules, uncheckedRules,
  type CheckFinding,
} from "@/lib/drawing-checks";
import { writeAudit } from "./audit-write";
import { deleteCheckFiles, loadCheckExceptions } from "./drawing-check-config";
import { revalidateDrawingViews } from "./drawing-lookup";

// The checker's callback (services/dxf-checker/README.md, "Callback"). Text
// from the DXF is untrusted: it is capped here and only ever rendered as text.

const text = (max: number) => z.string().transform(s => s.slice(0, max));
const record = z.record(z.string(), z.unknown());

const FindingSchema = z.object({
  rule: z.string().min(1).max(100),
  group: z.string().max(100).nullish(),
  severity: z.enum(CHECK_SEVERITIES),
  ref: text(300).optional(),
  title: text(500).optional(),
  message: text(5000),
  recommendation: text(5000).optional(),
  evidence: text(5000).optional(),
});

export const CheckCallbackSchema = z.object({
  runId: z.string().min(1).max(100),
  status: z.enum(["done", "failed"]),
  errorCode: z.string().max(50).nullish(),
  error: text(2000).nullish(),
  engineVersion: z.string().max(50).nullish(),
  standards: record.nullish(),
  file: z.object({
    name: text(255).nullish(),
    sizeBytes: z.number().int().nonnegative().nullish(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/i).nullish(),
  }).nullish(),
  durationMs: z.number().nonnegative().nullish(),
  findings: z.array(FindingSchema).max(10_000).default([]),
  parsedName: record.nullish(),
  titleblock: record.nullish(),
  stats: record.nullish(),
  ignoredRules: z.array(z.string().max(100)).max(1000).nullish(),
});

export type CheckCallback = z.infer<typeof CheckCallbackSchema>;

/** Postgres refuses NUL in text and jsonb; a DXF can carry anything. */
export function stripNul(value: unknown): unknown {
  if (typeof value === "string") return value.includes("\u0000") ? value.replaceAll("\u0000", "") : value;
  if (Array.isArray(value)) return value.map(stripNul);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [stripNul(k) as string, stripNul(v)]));
  }
  return value;
}

export type CallbackOutcome = { status: 200 | 400 | 404 | 409; body: Record<string, unknown> };

const UNREADABLE = "The checker's answer couldn't be read — upload the file again.";

async function loadRun(runId: string) {
  const [run] = await db
    .select({
      id: drawingCheckRuns.id,
      status: drawingCheckRuns.status,
      drawingId: drawingCheckRuns.drawingId,
      revisionId: drawingCheckRuns.revisionId,
      revisionLabel: drawingCheckRuns.revisionLabel,
      revisionNumber: drawingRevisions.number,
      uploadedById: drawingCheckRuns.uploadedById,
      originalName: drawingCheckRuns.originalName,
      objectKey: drawingCheckRuns.objectKey,
      configSnapshot: drawingCheckRuns.configSnapshot,
      code: drawings.code,
      projectId: drawings.projectId,
    })
    .from(drawingCheckRuns)
    .innerJoin(drawingRevisions, eq(drawingRevisions.id, drawingCheckRuns.revisionId))
    .innerJoin(drawings, eq(drawings.id, drawingCheckRuns.drawingId))
    .where(eq(drawingCheckRuns.id, runId))
    .limit(1);
  return run ?? null;
}

type Run = NonNullable<Awaited<ReturnType<typeof loadRun>>>;

class RunClosed extends Error {}

/** A failed run (or one whose answer couldn't be read): recorded, Remarks untouched, the DXF deleted. */
async function failRun(run: Run, errorCode: string, error: string, extra: Partial<typeof drawingCheckRuns.$inferInsert> = {}) {
  const now = new Date();
  const closed = await db.transaction(async tx => {
    const [row] = await tx
      .update(drawingCheckRuns)
      .set({ ...extra, status: "failed", errorCode, error, finishedAt: now })
      .where(and(eq(drawingCheckRuns.id, run.id), eq(drawingCheckRuns.status, "queued")))
      .returning({ id: drawingCheckRuns.id });
    if (!row) return false;
    await tx.insert(drawingEvents).values({
      drawingId: run.drawingId,
      revisionId: run.revisionId,
      kind: "check",
      body: `Check of ${run.originalName} failed — ${error}`,
      actorId: run.uploadedById,
    });
    return true;
  });
  if (!closed) return false;
  await writeAudit({
    kind: "drawing.check.finished",
    actorId: null,
    refType: "drawing",
    refId: run.drawingId,
    summary: `${run.code} ${run.revisionLabel} DXF check failed — ${error}`,
    payload: { projectId: run.projectId, revisionId: run.revisionId, runId: run.id, status: "failed", errorCode },
  });
  revalidateDrawingViews(run.drawingId, run.projectId);
  await deleteCheckFiles([run.objectKey]);
  return true;
}

/** The checker sent something that isn't a result: fail the run (if it is still waiting) so the revision frees up. */
export async function failUnreadableResult(runId: string): Promise<void> {
  const run = await loadRun(runId);
  if (run?.status === "queued") await failRun(run, "BAD_RESULT", UNREADABLE);
}

/**
 * Records a run's result. A done run turns its findings into Remarks
 * (`planRemarkChanges`) in one transaction that holds the drawing row, so two
 * results for the same drawing never interleave. A failed run changes no
 * Remark. Either way the DXF leaves the bucket.
 *
 * 404 unknown run, 409 already closed (the checker stops retrying on both).
 */
export async function applyCheckResult(runId: string, result: CheckCallback): Promise<CallbackOutcome> {
  const run = await loadRun(runId);
  if (!run) return { status: 404, body: { error: "unknown run" } };
  if (run.status !== "queued") return { status: 409, body: { error: `run is ${run.status}` } };

  const file = {
    sha256: result.file?.sha256?.toLowerCase() ?? null,
    engineVersion: result.engineVersion ?? null,
    details: {
      standards: result.standards ?? null,
      parsedName: result.parsedName ?? null,
      titleblock: result.titleblock ?? null,
      stats: result.stats ?? null,
      ignoredRules: result.ignoredRules ?? [],
      durationMs: result.durationMs ?? null,
    },
  };

  if (result.status === "failed") {
    const error = result.error?.trim() || "The checker couldn't check this file.";
    const closed = await failRun(run, result.errorCode ?? "INTERNAL", error, file);
    return closed ? { status: 200, body: { ok: true } } : { status: 409, body: { error: "run already closed" } };
  }

  const findings: CheckFinding[] = result.findings.map(f => ({
    rule: f.rule,
    severity: f.severity as CheckSeverity,
    group: f.group ?? null,
    ref: f.ref ?? "",
    title: f.title ?? "",
    message: f.message,
    recommendation: f.recommendation ?? "",
    evidence: f.evidence ?? "",
  }));
  const counts = countFindings(findings);
  const enabled = run.configSnapshot?.enabled ?? CHECK_RULE_IDS;
  const unchecked = uncheckedRules({ nameParsed: result.parsedName != null, titleBlockFound: result.titleblock != null });
  const now = new Date();

  let changes: DrawingCheckRemarkChanges;
  try {
    changes = await db.transaction(async tx => {
      await tx.select({ id: drawings.id }).from(drawings).where(eq(drawings.id, run.drawingId)).for("update");
      const [mine] = await tx
        .update(drawingCheckRuns)
        .set({ ...file, status: "done", findings, counts, finishedAt: now })
        .where(and(eq(drawingCheckRuns.id, run.id), eq(drawingCheckRuns.status, "queued")))
        .returning({ id: drawingCheckRuns.id });
      if (!mine) throw new RunClosed();

      // A newer revision was checked already: this older file must not reopen or close its Remarks.
      const [newer] = await tx
        .select({ id: drawingCheckRuns.id })
        .from(drawingCheckRuns)
        .innerJoin(drawingRevisions, eq(drawingRevisions.id, drawingCheckRuns.revisionId))
        .where(and(
          eq(drawingCheckRuns.drawingId, run.drawingId),
          eq(drawingCheckRuns.status, "done"),
          gt(drawingRevisions.number, run.revisionNumber),
        ))
        .limit(1);
      let out: DrawingCheckRemarkChanges;
      if (newer) {
        out = { created: [], updated: [], closed: [], skipped: "newer-check" };
      } else {
        const open = await tx
          .select({
            id: drawingRemarks.id,
            ruleId: drawingRemarks.checkRuleId,
            body: drawingRemarks.body,
            severity: drawingRemarks.checkSeverity,
          })
          .from(drawingRemarks)
          .where(and(
            eq(drawingRemarks.drawingId, run.drawingId),
            isNull(drawingRemarks.resolvedAt),
            isNotNull(drawingRemarks.checkRuleId),
          ));
        // Read now, not at upload: a false error marked or a project exception set while the
        // file was being checked already applies to this result.
        const suppressed = suppressedCheckRules(await loadCheckExceptions(run.drawingId, tx));
        const plan = planRemarkChanges({
          findings,
          enabled,
          open: open.map(r => ({ ...r, ruleId: r.ruleId! })),
          unchecked,
          suppressed,
        });

        const created = plan.create.length
          ? await tx
              .insert(drawingRemarks)
              .values(plan.create.map(c => ({
                drawingId: run.drawingId,
                revisionId: run.revisionId,
                source: "check" as const,
                body: c.body,
                raisedById: null,
                checkRuleId: c.ruleId,
                checkSeverity: c.severity,
                lastCheckRunId: run.id,
              })))
              .returning({ id: drawingRemarks.id })
          : [];
        for (const u of plan.update) {
          await tx
            .update(drawingRemarks)
            .set({ body: u.body, checkSeverity: u.severity, lastCheckRunId: run.id })
            .where(eq(drawingRemarks.id, u.id));
        }
        if (plan.close.length) {
          await tx
            .update(drawingRemarks)
            .set({
              resolvedAt: now,
              resolvedById: null,
              resolvedInRevisionId: run.revisionId,
              resolution: `Fixed — the automatic check of ${run.revisionLabel} (${run.originalName}) passed.`,
              lastCheckRunId: run.id,
            })
            .where(and(inArray(drawingRemarks.id, plan.close.map(c => c.id)), isNull(drawingRemarks.resolvedAt)));
        }
        out = { created: created.map(c => c.id), updated: plan.update.map(u => u.id), closed: plan.close.map(c => c.id) };
      }

      await tx.update(drawingCheckRuns).set({ remarkChanges: out }).where(eq(drawingCheckRuns.id, run.id));
      const remarks = out.skipped
        ? "Remarks unchanged — a newer revision was checked already."
        : describeRemarkChanges({ created: out.created.length, updated: out.updated.length, closed: out.closed.length });
      await tx.insert(drawingEvents).values({
        drawingId: run.drawingId,
        revisionId: run.revisionId,
        kind: "check",
        body: [`Checked ${run.originalName}: ${describeCounts(counts)}.`, remarks].filter(Boolean).join(" "),
        actorId: run.uploadedById,
      });
      return out;
    });
  } catch (e) {
    if (e instanceof RunClosed) return { status: 409, body: { error: "run already closed" } };
    throw e;
  }

  await writeAudit({
    kind: "drawing.check.finished",
    actorId: null,
    refType: "drawing",
    refId: run.drawingId,
    summary: `${run.code} ${run.revisionLabel} DXF checked — ${describeCounts(counts)}`,
    payload: {
      projectId: run.projectId,
      revisionId: run.revisionId,
      runId: run.id,
      status: "done",
      counts,
      engineVersion: file.engineVersion,
      remarksCreated: changes.created.length,
      remarksUpdated: changes.updated.length,
      remarksClosed: changes.closed.length,
      ...(changes.skipped ? { skipped: changes.skipped } : {}),
    },
  });
  revalidateDrawingViews(run.drawingId, run.projectId);
  await deleteCheckFiles([run.objectKey]);
  return { status: 200, body: { ok: true } };
}
