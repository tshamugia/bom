import { NextResponse, type NextRequest } from "next/server";
import { presignDownload } from "@/lib/s3";
import { getExport } from "@/server/queries/exports";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const ex = await getExport(id);
  if (!ex) return new NextResponse("Not found", { status: 404 });
  const url = await presignDownload(ex.fileKey, 60 * 5);
  return NextResponse.redirect(url);
}
