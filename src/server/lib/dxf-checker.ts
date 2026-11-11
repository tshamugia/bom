import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

// The app's side of the dxf-checker contract (services/dxf-checker/README.md):
// `POST /v1/checks` out, the bearer check on the callback in. Both directions
// use the shared DXF_CHECKER_SECRET.

export type DxfCheckerSetup = { url: string; secret: string; callbackBase: string };

/** The checker's address and secret, or null while any of the three variables is missing. */
export function dxfCheckerSetup(): DxfCheckerSetup | null {
  if (!env.DXF_CHECKER_URL || !env.DXF_CHECKER_SECRET || !env.APP_INTERNAL_URL) return null;
  return {
    url: env.DXF_CHECKER_URL.replace(/\/+$/, ""),
    secret: env.DXF_CHECKER_SECRET,
    callbackBase: env.APP_INTERNAL_URL.replace(/\/+$/, ""),
  };
}

/** Where the checker posts the result of one run, over the private network. */
export function checkCallbackUrl(setup: DxfCheckerSetup, runId: string): string {
  return `${setup.callbackBase}/api/internal/drawing-checks/${encodeURIComponent(runId)}/result`;
}

/** Codes the app stores on a run it closes itself; the checker's own codes come in the callback. */
export type SubmitErrorCode = "UNREACHABLE" | "BUSY" | "TOO_LARGE" | "REFUSED";

export type SubmitResult = { ok: true } | { ok: false; code: SubmitErrorCode; error: string };

const SUBMIT_TIMEOUT_MS = 15_000;

async function refusalDetail(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as { detail?: unknown };
    return typeof body.detail === "string" ? body.detail.slice(0, 500) : null;
  } catch {
    return null;
  }
}

/** Hands one run to the checker. It answers 202 at once; the findings come later to the callback. */
export async function submitCheck(setup: DxfCheckerSetup, body: object): Promise<SubmitResult> {
  let res: Response;
  try {
    res = await fetch(`${setup.url}/v1/checks`, {
      method: "POST",
      headers: { authorization: `Bearer ${setup.secret}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (e) {
    console.error("[dxf-checker] request failed:", e instanceof Error ? e.message : e);
    return { ok: false, code: "UNREACHABLE", error: "The checker didn't answer — try again in a few minutes." };
  }
  if (res.ok) return { ok: true };
  if (res.status === 503) return { ok: false, code: "BUSY", error: "The checker is busy — try again in a minute." };
  if (res.status === 413) {
    return { ok: false, code: "TOO_LARGE", error: "The checker refused the file: it is larger than the checker accepts." };
  }
  if (res.status === 401) {
    console.error("[dxf-checker] 401: DXF_CHECKER_SECRET differs between the app and the service");
    return { ok: false, code: "REFUSED", error: "The checker refused the app's key — ask an admin to check the checker setup." };
  }
  const detail = res.status === 422 ? await refusalDetail(res) : null;
  console.error(`[dxf-checker] refused with ${res.status}${detail ? `: ${detail}` : ""}`);
  return {
    ok: false,
    code: "REFUSED",
    error: detail ? `The checker refused the request: ${detail}` : `The checker refused the request (${res.status}) — ask an admin.`,
  };
}

const digest = (s: string) => createHash("sha256").update(s, "utf8").digest();

/**
 * Whether a request carries the checker's bearer secret. Compared in constant
 * time (over digests, so the length doesn't leak either); always false while
 * the app has no secret configured.
 */
export function isCheckerRequest(authorization: string | null): boolean {
  const secret = env.DXF_CHECKER_SECRET;
  if (!secret || !authorization) return false;
  const [scheme, token] = authorization.trim().split(/\s+/, 2);
  if (scheme?.toLowerCase() !== "bearer" || !token) return false;
  return timingSafeEqual(digest(token), digest(secret));
}

/**
 * Asks the checker whether a check would accept these parameters — its Python
 * compiles the patterns, which is the final word on them. `unknown` when it
 * couldn't answer (not running, an older version without the endpoint):
 * Settings then relies on its own check.
 */
export async function validateParamsWithChecker(
  setup: DxfCheckerSetup,
  params: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; error: string } | { ok: "unknown" }> {
  try {
    const res = await fetch(`${setup.url}/v1/params/validate`, {
      method: "POST",
      headers: { authorization: `Bearer ${setup.secret}`, "content-type": "application/json" },
      body: JSON.stringify({ params }),
      signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
      cache: "no-store",
    });
    if (res.ok) return { ok: true };
    if (res.status === 422) {
      const detail = await refusalDetail(res);
      if (detail) return { ok: false, error: detail };
    }
    return { ok: "unknown" };
  } catch {
    return { ok: "unknown" };
  }
}
