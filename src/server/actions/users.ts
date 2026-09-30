"use server";

import { z } from "zod";
import { createId } from "@paralleldrive/cuid2";
import { and, eq, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { account, session as sessionTable, user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/password-policy";
import { USER_ROLES } from "@/lib/roles";
import { requireRole } from "../auth-context";
import { createUserDirect } from "../lib/create-user-direct";
import { audit } from "../audit";
import { sendPasswordResetByAdminEmail, sendWelcomeEmail, type SendMailResult } from "@/lib/mailer";

const Password = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);

const CreateUserInput = z.object({
  email: z.string().email(),
  password: Password,
  name: z.string().trim().min(1).max(120),
  role: z.enum(USER_ROLES),
});

export type CreateUserInputT = z.infer<typeof CreateUserInput>;

type EmailOutcome = { emailStatus: "sent" | "skipped" | "failed"; emailError?: string };

async function deliver(send: () => Promise<SendMailResult>): Promise<EmailOutcome> {
  try {
    const result = await send();
    if (result.sent) return { emailStatus: "sent" };
    if (result.reason === "SMTP_NOT_CONFIGURED") return { emailStatus: "skipped" };
    return { emailStatus: "failed", emailError: result.detail };
  } catch (err) {
    return { emailStatus: "failed", emailError: err instanceof Error ? err.message : String(err) };
  }
}

async function loadTarget(id: string) {
  const [target] = await db
    .select({ id: user.id, role: user.role, email: user.email, name: user.name })
    .from(user)
    .where(eq(user.id, id))
    .limit(1);
  if (!target) throw new Error("USER_NOT_FOUND");
  return target;
}

export async function createUser(input: CreateUserInputT) {
  const data = CreateUserInput.parse(input);
  await requireRole("admin");

  const { id: newUserId } = await createUserDirect({
    email: data.email,
    password: data.password,
    name: data.name,
    role: data.role,
  });

  const email = await deliver(() =>
    sendWelcomeEmail({ to: data.email, name: data.name, password: data.password, role: data.role }),
  );

  revalidatePath("/users");
  await audit({
    kind: "user.created",
    refType: "user",
    refId: newUserId,
    summary: `Created ${data.role} ${data.email}`,
    payload: { email: data.email, role: data.role, ...email },
  });
  return { id: newUserId, ...email };
}

export async function listUsers() {
  await requireRole("admin");
  return db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      disabled: user.disabled,
      createdAt: user.createdAt,
    })
    .from(user)
    .orderBy(desc(user.createdAt));
}

export async function setUserDisabled(input: { id: string; disabled: boolean }) {
  const { id, disabled } = z.object({ id: z.string(), disabled: z.boolean() }).parse(input);
  const session = await requireRole("admin");

  if (id === session.user.id) throw new Error("CANNOT_DISABLE_SELF");
  const target = await loadTarget(id);

  await db.update(user).set({ disabled, updatedAt: new Date() }).where(eq(user.id, id));
  // Sign them out everywhere right away instead of waiting for the cookie to expire.
  if (disabled) await db.delete(sessionTable).where(eq(sessionTable.userId, id));

  revalidatePath("/users");
  await audit({
    kind: "user.disabled",
    refType: "user",
    refId: id,
    summary: `${disabled ? "Disabled" : "Re-enabled"} ${target.email}`,
    payload: { disabled },
  });
}

export async function setUserRole(input: { id: string; role: (typeof USER_ROLES)[number] }) {
  const { id, role } = z.object({ id: z.string(), role: z.enum(USER_ROLES) }).parse(input);
  const session = await requireRole("admin");

  // Stops the last admin from locking everyone out of user management.
  if (id === session.user.id) throw new Error("CANNOT_CHANGE_OWN_ROLE");
  const target = await loadTarget(id);
  if (target.role === role) return;

  await db.update(user).set({ role, updatedAt: new Date() }).where(eq(user.id, id));
  revalidatePath("/users");
  await audit({
    kind: "user.role.changed",
    refType: "user",
    refId: id,
    summary: `${target.email}: ${target.role} → ${role}`,
    payload: { from: target.role, to: role },
  });
}

/**
 * Admin sets a new temporary password for someone else, signs them out
 * everywhere and emails them the password, which they must replace on their
 * next sign-in. Admins change their own password from Settings → Profile (or
 * the sign-in page's "Forgot password?").
 */
export async function resetUserPassword(input: { id: string; password: string }) {
  const { id, password } = z.object({ id: z.string(), password: Password }).parse(input);
  const session = await requireRole("admin");

  if (id === session.user.id) throw new Error("USE_PROFILE_TO_CHANGE_OWN_PASSWORD");
  const target = await loadTarget(id);

  const ctx = await auth.$context;
  const hash = await ctx.password.hash(password);

  await db.transaction(async tx => {
    const updated = await tx
      .update(account)
      .set({ password: hash, updatedAt: new Date() })
      .where(and(eq(account.userId, id), eq(account.providerId, "credential")))
      .returning({ id: account.id });
    if (updated.length === 0) {
      await tx.insert(account).values({
        id: createId(),
        userId: id,
        accountId: id,
        providerId: "credential",
        password: hash,
      });
    }
    await tx.update(user).set({ mustChangePassword: true, updatedAt: new Date() }).where(eq(user.id, id));
    await tx.delete(sessionTable).where(eq(sessionTable.userId, id));
  });

  const email = await deliver(() =>
    sendPasswordResetByAdminEmail({ to: target.email, name: target.name, password }),
  );

  revalidatePath("/users");
  await audit({
    kind: "user.password.reset",
    refType: "user",
    refId: id,
    summary: `Reset password for ${target.email}`,
    payload: { via: "admin", ...email },
  });
  return email;
}
