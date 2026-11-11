import "server-only";
import { z } from "zod";
import { and, eq, gt, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { drawingCheckRuns, drawingEvents, drawingRemarks, drawingRevisions, drawings } from "@/db/schema";
import type { DrawingCheckDetails, DrawingCheckRemarkChanges } from "@/db/schema";
import { CHECK_RULE_IDS, CHECK_SEVERITIES, type CheckSeverity } from "@/lib/drawing-check-rules";
import {
  countFindings, describeCounts, describeRemarkChanges, planRemarkChanges, uncheckedRules, type CheckFinding,
} from "@/lib/drawing-checks";
import { checkTitleBlockSheet, describeUndo, sheetCheckNote, type SheetCheck } from "@/lib/drawing-check-link";
import { writeAudit, type AuditRow } from "./audit-write";
import { deleteCheckFiles } from "./drawing-check-config";
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

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Holds the drawing row for the rest of the transaction, so two writers of its Remarks never interleave. */
async function lockDrawing(tx: Tx, drawingId: string) {
  const [d] = await tx
    .select({ id: drawings.id, sheetCode: drawings.sheetCode })
    .from(drawings)
    .where(eq(drawings.id, drawingId))
    .for("update");
  return d ?? null;
}

const remarkSummary = (c: DrawingCheckRemarkChanges) =>
  c.skipped
    ? "Remarks unchanged — a newer revision was checked already."
    : describeRemarkChanges({ created: c.created.length, updated: c.updated.length, closed: c.closed.length });

/**
 * Turns a finished run's findings into the drawing's automatic Remarks
 * (`planRemarkChanges`). The caller holds the drawing row. A result for an
 * older revision than one already checked changes nothing; `close: false`
 * (the title block couldn't be read) writes new Remarks but closes none.
 * Keeps what updated and closed Remarks looked like, for "Wrong file".
 */
async function writeRemarkChanges(
  tx: Tx,
  run: { id: string; drawingId: string; revisionId: string; revisionNumber: number; revisionLabel: string; originalName: string },
  i: { findings: CheckFinding[]; enabled: readonly string[]; unchecked: ReadonlySet<string>; close: boolean; now: Date },
): Promise<DrawingCheckRemarkChanges> {
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
  if (newer) return { created: [], updated: [], closed: [], skipped: "newer-check" };

  const open = await tx
    .select({
      id: drawingRemarks.id,
      ruleId: drawingRemarks.checkRuleId,
      body: drawingRemarks.body,
      severity: drawingRemarks.checkSeverity,
      lastCheckRunId: drawingRemarks.lastCheckRunId,
    })
    .from(drawingRemarks)
    .where(and(
      eq(drawingRemarks.drawingId, run.drawingId),
      isNull(drawingRemarks.resolvedAt),
      isNotNull(drawingRemarks.checkRuleId),
    ));
  const plan = planRemarkChanges({
    findings: i.findings,
    enabled: i.enabled,
    open: open.map(r => ({ ...r, ruleId: r.ruleId! })),
    unchecked: i.unchecked,
  });
  if (!i.close) {
    plan.untouched.push(...plan.close);
    plan.close = [];
  }

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
        resolvedAt: i.now,
        resolvedById: null,
        resolvedInRevisionId: run.revisionId,
        resolution: `Fixed — the automatic check of ${run.revisionLabel} (${run.originalName}) passed.`,
        lastCheckRunId: run.id,
      })
      .where(and(inArray(drawingRemarks.id, plan.close.map(c => c.id)), isNull(drawingRemarks.resolvedAt)));
  }
  const touched = new Set([...plan.update.map(u => u.id), ...plan.close.map(c => c.id)]);
  return {
    created: created.map(c => c.id),
    updated: plan.update.map(u => u.id),
    closed: plan.close.map(c => c.id),
    previous: open
      .filter(r => touched.has(r.id))
      .map(r => ({ id: r.id, body: r.body, severity: r.severity, lastCheckRunId: r.lastCheckRunId })),
  };
}

const enabledRules = (snapshot: { enabled?: string[] } | null | undefined) => snapshot?.enabled ?? CHECK_RULE_IDS;

const uncheckedFor = (details: DrawingCheckDetails | null | undefined) =>
  uncheckedRules({ nameParsed: details?.parsedName != null, titleBlockFound: details?.titleblock != null });

/**
 * Records a run's result. A failed run changes no Remark. A done run is first
 * held against the drawing's sheet code (`checkTitleBlockSheet`): a title
 * block that names another sheet changes nothing and leaves the run `held`
 * for a person; one that can't be read writes new Remarks but closes none;
 * otherwise the findings become Remarks as usual. All of it happens in one
 * transaction that holds the drawing row. Either way the DXF leaves the bucket.
 *
 * 404 unknown run, 409 already closed (the checker stops retrying on both).
 */
export async function applyCheckResult(runId: string, result: CheckCallback): Promise<CallbackOutcome> {
  const run = await loadRun(runId);
  if (!run) return { status: 404, body: { error: "unknown run" } };
  if (run.status !== "queued") return { status: 409, body: { error: `run is ${run.status}` } };

  const details: DrawingCheckDetails = {
    standards: result.standards ?? null,
    parsedName: result.parsedName ?? null,
    titleblock: result.titleblock ?? null,
    stats: result.stats ?? null,
    ignoredRules: result.ignoredRules ?? [],
    durationMs: result.durationMs ?? null,
  };
  const file = {
    sha256: result.file?.sha256?.toLowerCase() ?? null,
    engineVersion: result.engineVersion ?? null,
    details,
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
  const now = new Date();

  let outcome: { verdict: SheetCheck; changes: DrawingCheckRemarkChanges | null };
  try {
    outcome = await db.transaction(async tx => {
      const drawing = await lockDrawing(tx, run.drawingId);
      const { verdict, found } = checkTitleBlockSheet({ sheetCode: drawing?.sheetCode ?? null, titleblock: details.titleblock });
      const held = verdict === "mismatch";
      const [mine] = await tx
        .update(drawingCheckRuns)
        .set({ ...file, status: held ? "held" : "done", findings, counts, sheetCheck: verdict, finishedAt: now })
        .where(and(eq(drawingCheckRuns.id, run.id), eq(drawingCheckRuns.status, "queued")))
        .returning({ id: drawingCheckRuns.id });
      if (!mine) throw new RunClosed();

      const note = sheetCheckNote({ verdict, found, sheetCode: drawing?.sheetCode ?? null });
      let changes: DrawingCheckRemarkChanges | null = null;
      if (!held) {
        changes = await writeRemarkChanges(tx, run, {
          findings,
          enabled: enabledRules(run.configSnapshot),
          unchecked: uncheckedFor(details),
          close: verdict !== "unreadable",
          now,
        });
        await tx
          .update(drawingCheckRuns)
          .set({ remarkChanges: changes, appliedAt: changes.skipped ? null : now })
          .where(eq(drawingCheckRuns.id, run.id));
      }
      await tx.insert(drawingEvents).values({
        drawingId: run.drawingId,
        revisionId: run.revisionId,
        kind: "check",
        body: [`Checked ${run.originalName}: ${describeCounts(counts)}.`, changes && remarkSummary(changes), note]
          .filter(Boolean)
          .join(" "),
        actorId: run.uploadedById,
      });
      return { verdict, changes };
    });
  } catch (e) {
    if (e instanceof RunClosed) return { status: 409, body: { error: "run already closed" } };
    throw e;
  }

  const { verdict, changes } = outcome;
  await writeAudit({
    kind: "drawing.check.finished",
    actorId: null,
    refType: "drawing",
    refId: run.drawingId,
    summary: changes
      ? `${run.code} ${run.revisionLabel} DXF checked — ${describeCounts(counts)}`
      : `${run.code} ${run.revisionLabel} DXF checked — the title block names another sheet, waiting for a person`,
    payload: {
      projectId: run.projectId,
      revisionId: run.revisionId,
      runId: run.id,
      status: changes ? "done" : "held",
      sheetCheck: verdict,
      counts,
      engineVersion: file.engineVersion,
      ...(changes
        ? {
            remarksCreated: changes.created.length,
            remarksUpdated: changes.updated.length,
            remarksClosed: changes.closed.length,
            ...(changes.skipped ? { skipped: changes.skipped } : {}),
          }
        : {}),
    },
  });
  revalidateDrawingViews(run.drawingId, run.projectId);
  await deleteCheckFiles([run.objectKey]);
  return { status: 200, body: { ok: true } };
}

// ── A person decides ───────────────────────────────────────────────────────

/** The action writes the audit row (it knows the request) and revalidates. */
export type DecideResult =
  | { ok: true; summary: string; drawingId: string; projectId: string; audit: Omit<AuditRow, "actorId" | "ip" | "userAgent"> }
  | { ok: false; error: string };

async function loadDecidable(tx: Tx, runId: string) {
  const [run] = await tx
    .select({
      id: drawingCheckRuns.id,
      status: drawingCheckRuns.status,
      drawingId: drawingCheckRuns.drawingId,
      revisionId: drawingCheckRuns.revisionId,
      revisionLabel: drawingCheckRuns.revisionLabel,
      revisionNumber: drawingRevisions.number,
      originalName: drawingCheckRuns.originalName,
      configSnapshot: drawingCheckRuns.configSnapshot,
      findings: drawingCheckRuns.findings,
      counts: drawingCheckRuns.counts,
      details: drawingCheckRuns.details,
      remarkChanges: drawingCheckRuns.remarkChanges,
      linkedSheetCode: drawingCheckRuns.linkedSheetCode,
      appliedAt: drawingCheckRuns.appliedAt,
      createdAt: drawingCheckRuns.createdAt,
      code: drawings.code,
      projectId: drawings.projectId,
      deletedAt: drawings.deletedAt,
    })
    .from(drawingCheckRuns)
    .innerJoin(drawingRevisions, eq(drawingRevisions.id, drawingCheckRuns.revisionId))
    .innerJoin(drawings, eq(drawings.id, drawingCheckRuns.drawingId))
    .where(eq(drawingCheckRuns.id, runId))
    .limit(1);
  return run && !run.deletedAt ? run : null;
}

class Refused extends Error {}

const NOT_FOUND = "This check was not found.";

/**
 * "It is this drawing's file": a held run's stored findings become Remarks
 * as if the title block had matched. Refused once a later check of the drawing
 * has come in — applying this one now would undo that one.
 */
export async function confirmHeldRun(runId: string, actorId: string): Promise<DecideResult> {
  const now = new Date();
  let done: { run: NonNullable<Awaited<ReturnType<typeof loadDecidable>>>; changes: DrawingCheckRemarkChanges };
  try {
    done = await db.transaction(async tx => {
      const first = await loadDecidable(tx, runId);
      if (!first) throw new Refused(NOT_FOUND);
      await lockDrawing(tx, first.drawingId);
      const run = await loadDecidable(tx, runId);
      if (!run) throw new Refused(NOT_FOUND);
      if (run.status !== "held") throw new Refused("Only a check that waits for confirmation can be confirmed.");
      const [later] = await tx
        .select({ id: drawingCheckRuns.id })
        .from(drawingCheckRuns)
        .where(and(
          eq(drawingCheckRuns.drawingId, run.drawingId),
          ne(drawingCheckRuns.id, run.id),
          eq(drawingCheckRuns.status, "done"),
          gt(drawingCheckRuns.createdAt, run.createdAt),
        ))
        .limit(1);
      if (later) {
        throw new Refused("A later check of this drawing has come in since — mark this one as the wrong file, or check the file again.");
      }
      const changes = await writeRemarkChanges(tx, run, {
        findings: run.findings ?? [],
        enabled: enabledRules(run.configSnapshot),
        unchecked: uncheckedFor(run.details),
        close: true,
        now,
      });
      await tx
        .update(drawingCheckRuns)
        .set({ status: "done", remarkChanges: changes, appliedAt: changes.skipped ? null : now, decidedById: actorId, decidedAt: now })
        .where(and(eq(drawingCheckRuns.id, run.id), eq(drawingCheckRuns.status, "held")));
      await tx.insert(drawingEvents).values({
        drawingId: run.drawingId,
        revisionId: run.revisionId,
        kind: "check",
        body: [`Confirmed ${run.originalName} as this drawing's file.`, remarkSummary(changes)].filter(Boolean).join(" "),
        actorId,
      });
      return { run, changes };
    });
  } catch (e) {
    if (e instanceof Refused) return { ok: false, error: e.message };
    throw e;
  }

  const { run, changes } = done;
  const summary = remarkSummary(changes) ?? "Remarks unchanged";
  const auditRow = {
    kind: "drawing.check.confirmed" as const,
    refType: "drawing",
    refId: run.drawingId,
    summary: `${run.code} ${run.revisionLabel} DXF ${run.originalName} confirmed as its file — ${summary}`,
    payload: {
      projectId: run.projectId,
      revisionId: run.revisionId,
      runId: run.id,
      remarksCreated: changes.created.length,
      remarksUpdated: changes.updated.length,
      remarksClosed: changes.closed.length,
      ...(changes.skipped ? { skipped: changes.skipped } : {}),
    },
  };
  return { ok: true, summary, drawingId: run.drawingId, projectId: run.projectId, audit: auditRow };
}

/**
 * "Wrong file": a held run is just set aside; a done run's Remark changes are
 * undone — Remarks it created and nobody closed by hand are deleted, Remarks it
 * closed reopen, Remarks it updated get their earlier text back — and the
 * sheet code its upload gave the drawing is taken back. Only the drawing's
 * latest run that changed Remarks can be undone; Remarks changed by hand since
 * are left as they are.
 */
export async function markRunWrongFile(runId: string, actorId: string): Promise<DecideResult> {
  const now = new Date();
  let done: {
    run: NonNullable<Awaited<ReturnType<typeof loadDecidable>>>;
    undo: { removed: number; reopened: number; restored: number; kept: number };
    unlinked: string | null;
  };
  try {
    done = await db.transaction(async tx => {
      const first = await loadDecidable(tx, runId);
      if (!first) throw new Refused(NOT_FOUND);
      const drawing = await lockDrawing(tx, first.drawingId);
      const run = await loadDecidable(tx, runId);
      if (!run || !drawing) throw new Refused(NOT_FOUND);
      if (run.status !== "done" && run.status !== "held") {
        throw new Refused("Only a finished check can be marked as the wrong file.");
      }

      const undo = { removed: 0, reopened: 0, restored: 0, kept: 0 };
      const changes = run.status === "done" ? run.remarkChanges : null;
      if (changes && run.appliedAt) {
        const [later] = await tx
          .select({ originalName: drawingCheckRuns.originalName })
          .from(drawingCheckRuns)
          .where(and(
            eq(drawingCheckRuns.drawingId, run.drawingId),
            ne(drawingCheckRuns.id, run.id),
            eq(drawingCheckRuns.status, "done"),
            gt(drawingCheckRuns.appliedAt, run.appliedAt),
          ))
          .limit(1);
        if (later) {
          throw new Refused(`A later check (${later.originalName}) changed the remarks after this one — only the latest can be undone.`);
        }
        const previous = new Map((changes.previous ?? []).map(p => [p.id, p]));

        if (changes.created.length) {
          const removed = await tx
            .delete(drawingRemarks)
            .where(and(
              inArray(drawingRemarks.id, changes.created),
              isNull(drawingRemarks.resolvedAt),
              eq(drawingRemarks.lastCheckRunId, run.id),
            ))
            .returning({ id: drawingRemarks.id });
          undo.removed = removed.length;
          undo.kept += changes.created.length - removed.length;
        }
        for (const id of changes.updated) {
          const before = previous.get(id);
          const restored = before
            ? await tx
                .update(drawingRemarks)
                .set({ body: before.body, checkSeverity: before.severity, lastCheckRunId: before.lastCheckRunId })
                .where(and(eq(drawingRemarks.id, id), isNull(drawingRemarks.resolvedAt), eq(drawingRemarks.lastCheckRunId, run.id)))
                .returning({ id: drawingRemarks.id })
            : [];
          if (restored.length) undo.restored += 1;
          else undo.kept += 1;
        }
        for (const id of changes.closed) {
          const [remark] = await tx
            .select({ ruleId: drawingRemarks.checkRuleId })
            .from(drawingRemarks)
            .where(and(
              eq(drawingRemarks.id, id),
              isNotNull(drawingRemarks.resolvedAt),
              isNull(drawingRemarks.resolvedById),
              eq(drawingRemarks.lastCheckRunId, run.id),
            ))
            .limit(1);
          // One open Remark per rule: if the rule has an open one again, this one stays closed.
          const [openAgain] = remark?.ruleId
            ? await tx
                .select({ id: drawingRemarks.id })
                .from(drawingRemarks)
                .where(and(
                  eq(drawingRemarks.drawingId, run.drawingId),
                  eq(drawingRemarks.checkRuleId, remark.ruleId),
                  isNull(drawingRemarks.resolvedAt),
                ))
                .limit(1)
            : [];
          if (!remark || openAgain) {
            undo.kept += 1;
            continue;
          }
          await tx
            .update(drawingRemarks)
            .set({
              resolvedAt: null,
              resolvedById: null,
              resolvedInRevisionId: null,
              resolution: null,
              lastCheckRunId: previous.get(id)?.lastCheckRunId ?? null,
            })
            .where(eq(drawingRemarks.id, id));
          undo.reopened += 1;
        }
      }

      let unlinked: string | null = null;
      if (run.linkedSheetCode && drawing.sheetCode === run.linkedSheetCode) {
        await tx
          .update(drawings)
          .set({ sheetCode: null, lastModifiedById: actorId, updatedAt: now })
          .where(eq(drawings.id, run.drawingId));
        await tx.insert(drawingEvents).values({
          drawingId: run.drawingId,
          revisionId: run.revisionId,
          kind: "updated",
          body: `Sheet code: ${run.linkedSheetCode} → — (it came with ${run.originalName}, marked as the wrong file)`,
          actorId,
        });
        unlinked = run.linkedSheetCode;
      }

      await tx
        .update(drawingCheckRuns)
        .set({ status: "wrong-file", decidedById: actorId, decidedAt: now })
        .where(eq(drawingCheckRuns.id, run.id));
      await tx.insert(drawingEvents).values({
        drawingId: run.drawingId,
        revisionId: run.revisionId,
        kind: "check",
        body: `Marked ${run.originalName} as the wrong file — ${describeUndo(undo)}.`,
        actorId,
      });
      return { run, undo, unlinked };
    });
  } catch (e) {
    if (e instanceof Refused) return { ok: false, error: e.message };
    throw e;
  }

  const { run, undo, unlinked } = done;
  const summary = describeUndo(undo);
  const auditRow = {
    kind: "drawing.check.wrong-file" as const,
    refType: "drawing",
    refId: run.drawingId,
    summary: `${run.code} ${run.revisionLabel} DXF ${run.originalName} marked as the wrong file — ${summary}`,
    payload: { projectId: run.projectId, revisionId: run.revisionId, runId: run.id, ...undo, ...(unlinked ? { unlinkedSheetCode: unlinked } : {}) },
  };
  return { ok: true, summary, drawingId: run.drawingId, projectId: run.projectId, audit: auditRow };
}

