import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { account, user } from "@/db/schema";
import { auth } from "@/lib/auth";

/**
 * Create a user with a hashed password, bypassing better-auth's `disableSignUp`
 * gate. Used by the seed script and the admin `createUser` action — both run
 * server-side with explicit authorization and need to provision users while
 * public registration is closed.
 */
export async function createUserDirect(input: {
  email: string;
  password: string;
  name: string;
  role: "owner" | "admin" | "member";
}) {
  const ctx = await auth.$context;
  const hash = await ctx.password.hash(input.password);

  const id = createId();
  await db.transaction(async tx => {
    await tx.insert(user).values({
      id,
      name: input.name,
      email: input.email,
      emailVerified: true,
      role: input.role,
    });
    await tx.insert(account).values({
      id: createId(),
      userId: id,
      accountId: id,
      providerId: "credential",
      password: hash,
    });
  });
  return { id };
}

export async function findUserByEmail(email: string) {
  const [u] = await db.select({ id: user.id }).from(user).where(eq(user.email, email)).limit(1);
  return u ?? null;
}
