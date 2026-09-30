import { and, count, eq, gt, max, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { auditLog, user } from "@/db/schema";

// No "server-only" here: `src/lib/auth.ts` imports this, and the seed scripts
// import `auth` under plain Node where "server-only" throws.

/** Failed sign-ins for one email within the window before it is locked. */
export const SIGN_IN_MAX_FAILURES = 10;
export const SIGN_IN_LOCK_WINDOW_MS = 15 * 60_000;
/** Payload code for attempts refused by the lock — they don't extend it. */
export const ACCOUNT_LOCKED_CODE = "ACCOUNT_LOCKED";

/**
 * Counts the failed sign-ins for an email since the last successful one,
 * within the window. The failures are the `auth.signin.failed` audit rows the
 * auth hook already writes, so there is no extra table. Works for emails with
 * no account too, so a lock doesn't reveal which emails exist. `email` must
 * already be trimmed and lower-cased, as the hook stores it.
 */
export async function isSignInLocked(email: string, now = new Date()): Promise<boolean> {
  const windowStart = new Date(now.getTime() - SIGN_IN_LOCK_WINDOW_MS);

  const [lastSuccess] = await db
    .select({ at: max(auditLog.createdAt) })
    .from(auditLog)
    .innerJoin(user, eq(user.id, auditLog.actorId))
    .where(and(eq(auditLog.kind, "auth.signin"), sql`lower(${user.email}) = ${email}`));
  const since = lastSuccess?.at && lastSuccess.at > windowStart ? lastSuccess.at : windowStart;

  const [{ n }] = await db
    .select({ n: count() })
    .from(auditLog)
    .where(and(
      eq(auditLog.kind, "auth.signin.failed"),
      gt(auditLog.createdAt, since),
      sql`${auditLog.payload}->>'email' = ${email}`,
      sql`coalesce(${auditLog.payload}->>'code', '') <> ${ACCOUNT_LOCKED_CODE}`,
    ));
  return n >= SIGN_IN_MAX_FAILURES;
}
