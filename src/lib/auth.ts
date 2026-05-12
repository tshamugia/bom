import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db/client";
import { env } from "./env";

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
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    disableSignUp: true,
  },
  user: {
    additionalFields: {
      role: { type: "string", required: false, defaultValue: "member", input: false },
      disabled: { type: "boolean", required: false, defaultValue: false, input: false },
    },
  },
  advanced: {
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
