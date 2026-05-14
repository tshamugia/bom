"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "../auth-context";
import { audit } from "../audit";
import { runExport, type ExportOptionsT } from "../lib/run-export";
import { getProcurementSettings } from "../queries/system-settings";
import { sendProcurementBomEmail } from "@/lib/mailer";
import { requestApproval } from "./approvals";

const DEFAULT_SUBJECT = "BOM for procurement: {projectCode} ({bomName} Rev {revLetter})";
const DEFAULT_BODY = [
  "Hi,",
  "",
  "Please find the latest BOM attached for procurement review.",
  "",
  "Project: {projectCode} — {projectName}",
  "BOM: {bomName}",
  "Revision: {revLetter}",
  "Sent by: {requesterName}",
  "",
  "Thanks.",
].join("\n");

function applyTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

export type SendBomToProcurementResult =
  | { ok: true; exportId: string; workflowId: string }
  | { ok: false; code: "PROCUREMENT_RECIPIENTS_NOT_CONFIGURED" | "SMTP_NOT_CONFIGURED"; message: string }
  | { ok: false; code: "SMTP_SEND_FAILED" | "EXPORT_FAILED" | "APPROVAL_FAILED"; message: string };

export async function sendBomToProcurement(input: {
  revisionId: string;
  options: ExportOptionsT;
}): Promise<SendBomToProcurementResult> {
  const session = await requireSession();

  const settings = await getProcurementSettings();
  if (settings.to.length === 0) {
    return {
      ok: false,
      code: "PROCUREMENT_RECIPIENTS_NOT_CONFIGURED",
      message: "No procurement recipients configured.",
    };
  }

  let exported;
  try {
    exported = await runExport({ revisionId: input.revisionId, options: input.options });
  } catch (e) {
    const detail = e instanceof Error ? (e.message || e.name) : String(e);
    console.error("[procurement] export failed", e);
    return { ok: false, code: "EXPORT_FAILED", message: detail };
  }

  const vars = {
    projectCode: exported.projectCode,
    projectName: exported.projectName,
    bomName: exported.bomName,
    revLetter: exported.revisionLetter,
    requesterName: session.user.name ?? session.user.email ?? "Unknown",
  };

  const subject = applyTemplate(settings.subject ?? DEFAULT_SUBJECT, vars);
  const body = applyTemplate(settings.body ?? DEFAULT_BODY, vars);

  const result = await sendProcurementBomEmail({
    to: settings.to,
    cc: settings.cc,
    subject,
    text: body,
    attachment: {
      filename: exported.fileName,
      content: exported.buffer,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  });

  if (!result.sent) {
    if (result.reason === "SMTP_NOT_CONFIGURED") {
      return { ok: false, code: "SMTP_NOT_CONFIGURED", message: "SMTP is not configured on the server." };
    }
    return { ok: false, code: "SMTP_SEND_FAILED", message: result.detail };
  }

  let workflow;
  try {
    workflow = await requestApproval({ revisionId: input.revisionId });
  } catch (e) {
    const detail = e instanceof Error ? (e.message || e.name) : String(e);
    console.error("[procurement] requestApproval failed", e);
    return { ok: false, code: "APPROVAL_FAILED", message: detail };
  }

  await audit({
    kind: "procurement.email.sent",
    refType: "export",
    refId: exported.row.id,
    summary: `BOM emailed to procurement (${settings.to.length} recipient${settings.to.length === 1 ? "" : "s"})`,
    payload: {
      revisionId: input.revisionId,
      to: settings.to,
      cc: settings.cc,
      fileName: exported.fileName,
    },
  });

  revalidatePath(`/preview/${exported.projectId}/${exported.bomId}`);

  return { ok: true, exportId: exported.row.id, workflowId: workflow.id };
}
