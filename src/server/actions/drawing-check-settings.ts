"use server";

import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import {
  DRAWING_CHECK_CONFIG_ID, drawingCheckConfig, drawingCheckWaivers, drawingRemarks, drawings, projects,
} from "@/db/schema";
import { CHECK_RULE_GROUPS, CHECK_SEVERITIES, checkRule } from "@/lib/drawing-check-rules";
import { parseCheckRulesConfig, type CheckRulesConfig } from "@/lib/drawing-checks";
import {
  CHECK_PARAMS, applyParamValues, changedParams, checkParam, crossParamErrors, paramValue, validateParamValue,
  type ParamOverrides, type ParamValue,
} from "@/lib/drawing-check-params";
import { countRuleChanges, describeRuleChanges, ruleChanges } from "@/lib/drawing-check-settings";
import { ADMIN_ONLY_ERROR, READ_ONLY_ERROR, canEdit, isAdmin } from "@/lib/roles";
import { requireSession } from "../auth-context";
import { audit } from "../audit";
import { loadDrawingCheckConfig } from "../lib/drawing-check-config";
import { findLatestRevision, revalidateDrawingViews } from "../lib/drawing-lookup";
import { dxfCheckerSetup, validateParamsWithChecker } from "../lib/dxf-checker";
import type { DrawingActionResult } from "./drawings";

// Settings → Drawings → DXF check settings (issue #18, stage 3): which rules
// run, at what severity, with which parameters; projects that use the client's
// file naming; and the "false error" on an automatic Remark. Every change to
// the rules or parameters bumps the config version — runs keep a snapshot.

const fail = (error: string) => ({ ok: false as const, error });

const STALE = "Someone else changed the DXF check settings while you were editing — reload the page and make your change again.";

const SETTINGS_PATH = "/settings/drawing-checks";

function revalidateSettings() {
  revalidatePath(SETTINGS_PATH);
  revalidatePath("/settings/drawings");
  revalidatePath("/drawings/[id]", "page");
}

/**
 * Writes the next version, only if nobody saved since `baseVersion` was read.
 * The first save creates the row (version 0 → 1). Null when it lost the race.
 */
async function writeConfig(
  baseVersion: number,
  next: { rules: CheckRulesConfig; params: ParamOverrides },
  actorId: string,
): Promise<number | null> {
  const version = baseVersion + 1;
  const values = { rules: next.rules, params: next.params, version, updatedById: actorId, updatedAt: new Date() };
  const rows = baseVersion === 0
    ? await db
        .insert(drawingCheckConfig)
        .values({ id: DRAWING_CHECK_CONFIG_ID, ...values })
        .onConflictDoNothing()
        .returning({ version: drawingCheckConfig.version })
    : await db
        .update(drawingCheckConfig)
        .set(values)
        .where(and(eq(drawingCheckConfig.id, DRAWING_CHECK_CONFIG_ID), eq(drawingCheckConfig.version, baseVersion)))
        .returning({ version: drawingCheckConfig.version });
  return rows.length ? version : null;
}

const BaseVersion = z.number().int().nonnegative();

const RulesInput = z.object({
  baseVersion: BaseVersion,
  disabled: z.array(z.string().max(100)).max(500),
  disabledGroups: z.array(z.string().max(100)).max(100),
  severity: z.record(z.string().max(100), z.enum(CHECK_SEVERITIES)),
});

/** Group and rule switches and severities. Admins only. */
export async function saveDrawingCheckRules(
  input: z.infer<typeof RulesInput>,
): Promise<DrawingActionResult<{ version: number }>> {
  const data = RulesInput.parse(input);
  const session = await requireSession();
  if (!isAdmin(session.user)) return fail(ADMIN_ONLY_ERROR);

  const unknown = [...data.disabled, ...Object.keys(data.severity)].filter(id => !checkRule(id));
  const unknownGroups = data.disabledGroups.filter(id => !CHECK_RULE_GROUPS.some(g => g.id === id));
  if (unknown.length || unknownGroups.length) return fail(`Unknown rule or group: ${[...unknown, ...unknownGroups].join(", ")}.`);

  const current = await loadDrawingCheckConfig();
  if (current.version !== data.baseVersion) return fail(STALE);
  const next = parseCheckRulesConfig(data);
  const changes = ruleChanges(current.rules, next);
  if (!countRuleChanges(changes)) return { ok: true, version: current.version };

  const version = await writeConfig(current.version, { rules: next, params: current.params }, session.user.id);
  if (version === null) return fail(STALE);

  await audit({
    kind: "drawing.check.settings.changed",
    summary: `DXF check rules v${version}: ${describeRuleChanges(changes)}`.slice(0, 1000),
    payload: { version, changes, rules: next },
  });
  revalidateSettings();
  return { ok: true, version };
}

const ParamsInput = z.object({
  baseVersion: BaseVersion,
  /** Parameter id (its rules.yaml path) → the value to use. */
  values: z.record(z.string().max(100), z.unknown()),
});

export type SaveParamsResult =
  | { ok: true; version: number }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Parameters from rules.yaml. Every value is validated — patterns are compiled
 * the way the checker's Python would, and when the checker is connected it is
 * asked too — and nothing is stored unless all of them pass. Admins only.
 */
export async function saveDrawingCheckParams(input: z.infer<typeof ParamsInput>): Promise<SaveParamsResult> {
  const data = ParamsInput.parse(input);
  const session = await requireSession();
  if (!isAdmin(session.user)) return fail(ADMIN_ONLY_ERROR);

  const fieldErrors: Record<string, string[]> = {};
  const values: Record<string, ParamValue> = {};
  for (const [id, raw] of Object.entries(data.values)) {
    const p = checkParam(id);
    if (!p) return fail(`Unknown parameter: ${id}.`);
    const checked = validateParamValue(p, raw);
    if (checked.ok) values[id] = checked.value;
    else fieldErrors[id] = checked.errors;
  }
  const invalid = (errors: Record<string, string[]>) => ({
    ok: false as const,
    error: "Some values aren't valid — nothing was saved.",
    fieldErrors: errors,
  });
  if (Object.keys(fieldErrors).length) return invalid(fieldErrors);

  const current = await loadDrawingCheckConfig();
  if (current.version !== data.baseVersion) return fail(STALE);
  const next = applyParamValues(current.params, values);
  const cross = crossParamErrors(next);
  if (Object.keys(cross).length) return invalid(cross);

  const changed = changedParams(current.params, next);
  if (!changed.length) return { ok: true, version: current.version };

  const setup = dxfCheckerSetup();
  if (setup) {
    const verdict = await validateParamsWithChecker(setup, next);
    if (verdict.ok === false) {
      // The checker names the parameter by its path, e.g. „drafting.sku_generic_pattern“.
      const p = CHECK_PARAMS.find(x => verdict.error.includes(x.id));
      return invalid({ [p?.id ?? changed[0].id]: [`The checker refused it: ${verdict.error}`] });
    }
  }

  const version = await writeConfig(current.version, { rules: current.rules, params: next }, session.user.id);
  if (version === null) return fail(STALE);

  await audit({
    kind: "drawing.check.settings.changed",
    summary: `DXF check parameters v${version}: ${changed.map(p => p.label).join(", ")}`.slice(0, 1000),
    payload: {
      version,
      changed: changed.map(p => p.id),
      before: Object.fromEntries(changed.map(p => [p.id, paramValue(current.params, p)])),
      after: Object.fromEntries(changed.map(p => [p.id, paramValue(next, p)])),
    },
  });
  revalidateSettings();
  return { ok: true, version };
}

const ClientNamingInput = z.object({ projectId: z.string().min(1), enabled: z.boolean() });

/**
 * NAMING §1: where the client's own file naming applies, checks of the
 * project's drawings skip the three file-name groups. Admins only.
 */
export async function setProjectClientNaming(input: z.infer<typeof ClientNamingInput>): Promise<DrawingActionResult> {
  const { projectId, enabled } = ClientNamingInput.parse(input);
  const session = await requireSession();
  if (!isAdmin(session.user)) return fail(ADMIN_ONLY_ERROR);

  const [project] = await db
    .update(projects)
    .set({ checkClientNaming: enabled })
    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
    .returning({ code: projects.code });
  if (!project) return fail("Project not found.");

  await audit({
    kind: "drawing.check.settings.changed",
    refType: "project",
    refId: projectId,
    summary: enabled
      ? `${project.code}: client file naming — DXF checks skip the file-name rules`
      : `${project.code}: standard file naming — DXF checks cover the file name again`,
    payload: { projectId, checkClientNaming: enabled },
  });
  revalidatePath(`/projects/${projectId}`);
  revalidateSettings();
  return { ok: true };
}

const FalseErrorInput = z.object({
  /** The open automatic Remark. */
  id: z.string().min(1),
  reason: z.string().trim().min(1, "Say why the check is wrong here.").max(2000),
});

/**
 * "False error" (მცდარი შეცდომა) when closing an automatic Remark: the Remark
 * closes and the rule stops running on this drawing until an admin removes
 * the exception. Any editor who could close the Remark can do it.
 */
export async function markCheckRemarkFalse(input: z.infer<typeof FalseErrorInput>): Promise<DrawingActionResult> {
  const parsed = FalseErrorInput.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input.");
  const data = parsed.data;
  const session = await requireSession();
  if (!canEdit(session.user)) return fail(READ_ONLY_ERROR);

  const [remark] = await db
    .select({
      id: drawingRemarks.id,
      source: drawingRemarks.source,
      ruleId: drawingRemarks.checkRuleId,
      resolvedAt: drawingRemarks.resolvedAt,
      drawingId: drawings.id,
      code: drawings.code,
      projectId: drawings.projectId,
    })
    .from(drawingRemarks)
    .innerJoin(drawings, eq(drawings.id, drawingRemarks.drawingId))
    .where(and(eq(drawingRemarks.id, data.id), isNull(drawings.deletedAt)))
    .limit(1);
  if (!remark) return fail("Remark not found.");
  if (remark.source !== "check" || !remark.ruleId) return fail("Only a remark from the automatic check can be a false error.");
  if (remark.resolvedAt) return fail("This remark is already resolved.");
  const ruleId = remark.ruleId;
  const latest = await findLatestRevision(remark.drawingId);

  const closed = await db.transaction(async tx => {
    // Holds the drawing like a check result does, so a result arriving now can't raise the rule again.
    await tx.select({ id: drawings.id }).from(drawings).where(eq(drawings.id, remark.drawingId)).for("update");
    const [row] = await tx
      .update(drawingRemarks)
      .set({
        resolvedAt: new Date(),
        resolvedById: session.user.id,
        resolvedInRevisionId: latest?.id ?? null,
        resolution: `False error — ${data.reason}`,
      })
      .where(and(eq(drawingRemarks.id, remark.id), isNull(drawingRemarks.resolvedAt)))
      .returning({ id: drawingRemarks.id });
    if (!row) return false;
    await tx
      .insert(drawingCheckWaivers)
      .values({ drawingId: remark.drawingId, ruleId, reason: data.reason, remarkId: remark.id, createdById: session.user.id })
      .onConflictDoNothing();
    return true;
  });
  if (!closed) return fail("This remark is already resolved.");

  await audit({
    kind: "drawing.check.waived",
    refType: "drawing",
    refId: remark.drawingId,
    summary: `${remark.code}: ${ruleId} marked as a false error — no longer checked on this drawing`,
    payload: { projectId: remark.projectId, remarkId: remark.id, ruleId, reason: data.reason },
  });
  revalidateDrawingViews(remark.drawingId, remark.projectId);
  return { ok: true };
}

/** An admin takes a false error back: the next check of the drawing runs the rule again. */
export async function removeDrawingCheckWaiver(input: { id: string }): Promise<DrawingActionResult> {
  const id = z.string().min(1).parse(input.id);
  const session = await requireSession();
  if (!isAdmin(session.user)) return fail(ADMIN_ONLY_ERROR);

  const [gone] = await db
    .delete(drawingCheckWaivers)
    .where(eq(drawingCheckWaivers.id, id))
    .returning({ drawingId: drawingCheckWaivers.drawingId, ruleId: drawingCheckWaivers.ruleId, reason: drawingCheckWaivers.reason });
  if (!gone) return fail("This false error was already removed.");
  const [drawing] = await db
    .select({ code: drawings.code, projectId: drawings.projectId })
    .from(drawings)
    .where(eq(drawings.id, gone.drawingId))
    .limit(1);

  await audit({
    kind: "drawing.check.waiver.removed",
    refType: "drawing",
    refId: gone.drawingId,
    summary: `${drawing?.code ?? "Drawing"}: ${gone.ruleId} is checked again — false error removed`,
    payload: { projectId: drawing?.projectId ?? null, ruleId: gone.ruleId, reason: gone.reason },
  });
  if (drawing) revalidateDrawingViews(gone.drawingId, drawing.projectId);
  revalidatePath(SETTINGS_PATH);
  return { ok: true };
}
