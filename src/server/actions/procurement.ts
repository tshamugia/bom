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

export async function sendBomToProcurement(input: {
  revisionId: string;
  options: ExportOptionsT;
}) {
  const session = await requireSession();

  const settings = await getProcurementSettings();
  if (settings.to.length === 0) {
    throw new Error("PROCUREMENT_RECIPIENTS_NOT_CONFIGURED");
  }

  const exported = await runExport({ revisionId: input.revisionId, options: input.options });

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
    throw new Error(result.reason);
  }

  const workflow = await requestApproval({ revisionId: input.revisionId });

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

  return { exportId: exported.row.id, workflowId: workflow.id };
}
