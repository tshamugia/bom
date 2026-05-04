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
          const [existing] = await db.select().from(organizations).limit(1);
          if (existing) {
            await db.insert(memberships).values({ userId: user.id, organizationId: existing.id, role: "member" });
            return;
          }
          const baseName = user.name?.trim() || user.email.split("@")[0] || "Workspace";
          const slugBase = baseName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "workspace";
          const slug = `${slugBase}-${user.id.slice(-6)}`;
          const [org] = await db
            .insert(organizations)
            .values({ name: `${baseName}'s Workspace`, slug })
            .returning();
          await db.insert(memberships).values({ userId: user.id, organizationId: org.id, role: "owner" });
        },
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
