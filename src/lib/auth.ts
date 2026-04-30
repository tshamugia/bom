import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { db } from "@/db/client";
import { memberships, organizations } from "@/db/schema";
import { env } from "./env";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  emailAndPassword: { enabled: true, autoSignIn: true },
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        // Plan 04 will swap this for a real email provider.
        console.log(`[magic-link] ${email} -> ${url}`);
      },
    }),
  ],
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          const [org] = await db.select().from(organizations).limit(1);
          if (!org) return;
          await db.insert(memberships).values({ userId: user.id, organizationId: org.id, role: "member" });
        },
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
