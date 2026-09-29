import { NextResponse, type NextRequest } from "next/server";
import { renderExportFile, XLSX_CONTENT_TYPE } from "@/server/lib/run-export";

/** Rebuilds the export from the revision and streams it back — nothing is stored. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let file;
  try {
    file = await renderExportFile(id);
  } catch (e) {
    const code = e instanceof Error ? e.message : "";
    if (code === "UNAUTHENTICATED" || code === "USER_DISABLED") {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    console.error("[exports] download failed", e);
    return new NextResponse("Couldn't generate the file", { status: 500 });
  }
  if (!file) return new NextResponse("Not found", { status: 404 });

  const asciiName = file.fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return new NextResponse(new Uint8Array(file.buffer), {
    status: 200,
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      "Cache-Control": "no-store",
    },
  });
}
