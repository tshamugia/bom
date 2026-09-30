import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { user as userTable } from "@/db/schema";
import { clientInfo, writeAudit } from "@/server/lib/audit-write";
import { ACCOUNT_LOCKED_CODE, SIGN_IN_LOCK_WINDOW_MS, isSignInLocked } from "@/server/lib/sign-in-lockout";
import { env } from "./env";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./password-policy";

const RESET_TOKEN_TTL_SECONDS = 60 * 60;

const signInEmailOf = (body: unknown) => {
  const email = (body as { email?: unknown } | undefined)?.email;
  return typeof email === "string" ? email.trim().toLowerCase() : "";
};

/** The user picked a password themselves, so the temporary one is gone. */
async function clearMustChangePassword(userId: string) {
  await db.update(userTable).set({ mustChangePassword: false }).where(eq(userTable.id, userId));
}

async function findAccountState(where: { id: string } | { email: string }) {
  const [row] = await db
    .select({ id: userTable.id, role: userTable.role, disabled: userTable.disabled })
    .from(userTable)
    .where("id" in where ? eq(userTable.id, where.id) : eq(userTable.email, where.email.toLowerCase()))
    .limit(1);
  return row ?? null;
}

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins:
    process.env.NODE_ENV === "production"
      ? [env.BETTER_AUTH_URL, env.NEXT_PUBLIC_BETTER_AUTH_URL]
      : [
          env.BETTER_AUTH_URL,
          env.NEXT_PUBLIC_BETTER_AUTH_URL,
          "http://192.168.*.*:3000",
          "http://10.*.*.*:3000",
        ],
  // Per client IP (see `advanced.ipAddress`); on in production only, in memory.
  rateLimit: {
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
    },
  },
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    disableSignUp: true,
    minPasswordLength: PASSWORD_MIN_LENGTH,
    maxPasswordLength: PASSWORD_MAX_LENGTH,
    resetPasswordTokenExpiresIn: RESET_TOKEN_TTL_SECONDS,
    revokeSessionsOnPasswordReset: true,
    // Only admins can reset their own password by email; members ask an admin
    // (Users → Reset password). The response is identical either way so the
    // form doesn't reveal which emails exist or what role they have.
    sendResetPassword: async ({ user, token }, request) => {
      const state = await findAccountState({ id: user.id });
      const info = clientInfo(request?.headers);
      const base = { actorId: null, refType: "user", refId: user.id, ...info } as const;

      if (!state || state.role !== "admin" || state.disabled) {
        await writeAudit({
          ...base,
          kind: "user.password.reset.requested",
          summary: `Password reset requested for ${user.email} — not sent (${state?.disabled ? "account disabled" : "members are reset by an admin"})`,
          payload: { email: user.email, sent: false },
        });
        return;
      }

      // Imported lazily: the mailer is server-only and this module is also
      // loaded by the seed scripts.
      const { sendPasswordResetLinkEmail } = await import("./mailer");
      const result = await sendPasswordResetLinkEmail({
        to: user.email,
        name: user.name,
        url: `${env.NEXT_PUBLIC_BETTER_AUTH_URL}/reset-password?token=${encodeURIComponent(token)}`,
        expiresInMinutes: RESET_TOKEN_TTL_SECONDS / 60,
      });
      await writeAudit({
        ...base,
        kind: "user.password.reset.requested",
        summary: result.sent
          ? `Password reset link emailed to ${user.email}`
          : `Password reset link for ${user.email} could not be sent`,
        payload: { email: user.email, sent: result.sent, ...(result.sent ? {} : { reason: result.reason }) },
      });
    },
    onPasswordReset: async ({ user }, request) => {
      await clearMustChangePassword(user.id);
      await writeAudit({
        kind: "user.password.reset",
        actorId: user.id,
        refType: "user",
        refId: user.id,
        summary: `${user.email} reset their password from an email link`,
        payload: { via: "email-link" },
        ...clientInfo(request?.headers),
      });
    },
  },
  user: {
    additionalFields: {
      role: { type: "string", required: false, defaultValue: "member", input: false },
      disabled: { type: "boolean", required: false, defaultValue: false, input: false },
      /** Set when an admin creates the account or resets its password; cleared once the user picks their own. */
      mustChangePassword: { type: "boolean", required: false, defaultValue: false, input: false },
    },
  },
  databaseHooks: {
    session: {
      create: {
        // Disabled accounts can't start a session (sign-in fails like a bad password).
        before: async session => {
          const state = await findAccountState({ id: session.userId });
          if (!state || state.disabled) return false;
        },
      },
    },
  },
  hooks: {
    // Per-account lock on top of the per-IP rate limit, so a password can't be
    // guessed slowly from many addresses. Refused attempts are logged with their
    // own code and don't count, so the lock ends when the window passes.
    before: createAuthMiddleware(async ctx => {
      if (ctx.path !== "/sign-in/email") return;
      const email = signInEmailOf(ctx.body);
      if (!email || !(await isSignInLocked(email))) return;

      await writeAudit({
        kind: "auth.signin.failed",
        actorId: null,
        summary: `Sign-in refused for ${email} — too many failed attempts`,
        payload: { email, code: ACCOUNT_LOCKED_CODE },
        ...clientInfo(ctx.headers ?? ctx.request?.headers),
      });
      throw new APIError("TOO_MANY_REQUESTS", {
        code: ACCOUNT_LOCKED_CODE,
        message: `Too many failed sign-in attempts. Try again in ${SIGN_IN_LOCK_WINDOW_MS / 60_000} minutes.`,
      });
    }),
    after: createAuthMiddleware(async ctx => {
      const info = clientInfo(ctx.headers ?? ctx.request?.headers);

      if (ctx.path === "/sign-in/email") {
        const signedIn = ctx.context.newSession?.user;
        if (signedIn) {
          await writeAudit({
            kind: "auth.signin",
            actorId: signedIn.id,
            refType: "user",
            refId: signedIn.id,
            summary: `${signedIn.email} signed in`,
            ...info,
          });
          return;
        }
        const returned = ctx.context.returned;
        if (isAPIError(returned)) {
          const email = signInEmailOf(ctx.body);
          const known = email ? await findAccountState({ email }) : null;
          await writeAudit({
            kind: "auth.signin.failed",
            actorId: null,
            refType: known ? "user" : undefined,
            refId: known?.id,
            summary: known?.disabled
              ? `Blocked sign-in for disabled account ${email}`
              : `Failed sign-in for ${email || "(no email)"}`,
            payload: { email, code: (returned.body as { code?: string } | undefined)?.code ?? returned.status },
            ...info,
          });
        }
        return;
      }

      if (ctx.path === "/change-password" && !isAPIError(ctx.context.returned)) {
        const me = ctx.context.session?.user;
        if (me) {
          await clearMustChangePassword(me.id);
          await writeAudit({
            kind: "user.password.changed",
            actorId: me.id,
            refType: "user",
            refId: me.id,
            summary: `${me.email} changed their password`,
            ...info,
          });
        }
      }
    }),
  },
  advanced: {
    // Railway's edge sets X-Real-IP to the client address; X-Forwarded-For is
    // passed through from the client, so keying on it would let anyone pick
    // their own rate-limit bucket.
    ipAddress: { ipAddressHeaders: ["x-real-ip"] },
    cookies: {
      session_token: { name: "better-auth.session_token" },
    },
    defaultCookieAttributes: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    },
  },
});

export type Session = typeof auth.$Infer.Session;
