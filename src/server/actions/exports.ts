"use server";

import { runExport, type ExportOptionsT } from "../lib/run-export";

export type GenerateExportResult =
  | { ok: true; id: string; fileName: string; /** base64 .xlsx */ data: string }
  | { ok: false; error: string };

export async function generateExport(input: { revisionId: string; options: ExportOptionsT }): Promise<GenerateExportResult> {
  try {
    const result = await runExport(input);
    return { ok: true, id: result.row.id, fileName: result.fileName, data: result.buffer.toString("base64") };
  } catch (e) {
    console.error("[exports] generate failed", e);
    const message = e instanceof Error ? e.message : String(e);
    if (message === "FORBIDDEN" || message === "UNAUTHENTICATED") return { ok: false, error: "You don't have permission to export this BOM." };
    if (message === "REVISION_NOT_FOUND") return { ok: false, error: "This revision no longer exists." };
    return { ok: false, error: "Couldn't generate the Excel file. Please try again." };
  }
}
