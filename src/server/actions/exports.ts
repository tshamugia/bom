"use server";

import { runExport, type ExportOptionsT } from "../lib/run-export";

export async function generateExport(input: { revisionId: string; options: ExportOptionsT }) {
  const result = await runExport(input);
  return result.row;
}
