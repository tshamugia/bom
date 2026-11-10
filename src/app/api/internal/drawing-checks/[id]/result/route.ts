import { NextResponse, type NextRequest } from "next/server";
import { isCheckerRequest } from "@/server/lib/dxf-checker";
import {
  CheckCallbackSchema, applyCheckResult, failUnreadableResult, stripNul,
} from "@/server/lib/drawing-check-result";

/** Findings of one DXF stay far below this; anything bigger isn't a result. */
const MAX_BODY_BYTES = 10 * 1024 * 1024;

const json = (body: Record<string, unknown>, status: number) =>
  NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });

/**
 * The dxf-checker posts a run's result here over Railway's private network
 * (issue #18). No session: the caller proves itself with the shared
 * DXF_CHECKER_SECRET, compared in constant time. Not under `src/proxy.ts`.
 *
 * 2xx done; 401/404/409/400/413 are final for the checker, 5xx makes it retry.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!isCheckerRequest(req.headers.get("authorization"))) return json({ error: "unauthorized" }, 401);
  const { id } = await ctx.params;
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return json({ error: "too large" }, 413);

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: "too large" }, 413);
  let body: unknown;
  try {
    body = stripNul(JSON.parse(raw));
  } catch {
    await failUnreadableResult(id);
    return json({ error: "invalid JSON" }, 400);
  }
  const parsed = CheckCallbackSchema.safeParse(body);
  if (!parsed.success || parsed.data.runId !== id) {
    console.error("[drawing-checks] unreadable result for run", id, parsed.success ? "runId mismatch" : parsed.error.issues.slice(0, 5));
    await failUnreadableResult(id);
    return json({ error: "invalid result" }, 400);
  }

  const out = await applyCheckResult(id, parsed.data);
  return json(out.body, out.status);
}
