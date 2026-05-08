"use server";

import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { user } from "@/db/schema";
import { requireRole, type UserRole } from "../auth-context";
import { createUserDirect } from "../lib/create-user-direct";
import { audit } from "../audit";
import { sendWelcomeEmail } from "@/lib/mailer";

const CreateUserInput = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().trim().min(1).max(120),
  role: z.enum(["owner", "admin", "member"]),
});

export type CreateUserInputT = z.infer<typeof CreateUserInput>;

export async function createUser(input: CreateUserInputT) {
  const data = CreateUserInput.parse(input);
  const session = await requireRole("owner", "admin");
  const callerRole = session.user.role as UserRole;

  if (data.role === "owner" && callerRole !== "owner") {
    throw new Error("FORBIDDEN_ROLE_ASSIGNMENT");
  }
  if (data.role === "admin" && callerRole !== "owner") {
    throw new Error("FORBIDDEN_ROLE_ASSIGNMENT");
  }

  const { id: newUserId } = await createUserDirect({
    email: data.email,
    password: data.password,
    name: data.name,
    role: data.role,
  });

  let emailStatus: "sent" | "skipped" | "failed" = "skipped";
  let emailError: string | undefined;
  try {
    const result = await sendWelcomeEmail({
      to: data.email,
      name: data.name,
      password: data.password,
      role: data.role,
    });
    emailStatus = result.sent ? "sent" : "skipped";
  } catch (err) {
    emailStatus = "failed";
    emailError = err instanceof Error ? err.message : String(err);
  }

  revalidatePath("/users");
  await audit({
    kind: "user.created",
    refType: "user",
    refId: newUserId,
    summary: `Created ${data.role} ${data.email}`,
    payload: {
      email: data.email,
      role: data.role,
      emailStatus,
      ...(emailError ? { emailError } : {}),
    },
  });
  return { id: newUserId, emailStatus, emailError };
}

export async function listUsers() {
  await requireRole("owner", "admin");
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
  const session = await requireRole("owner", "admin");

  if (id === session.user.id) throw new Error("CANNOT_DISABLE_SELF");

  const [target] = await db.select({ role: user.role, email: user.email }).from(user).where(eq(user.id, id)).limit(1);
  if (!target) throw new Error("USER_NOT_FOUND");
  if (target.role === "owner" && session.user.role !== "owner") throw new Error("FORBIDDEN");

  await db.update(user).set({ disabled }).where(eq(user.id, id));
  revalidatePath("/users");
  await audit({
    kind: "user.disabled",
    refType: "user",
    refId: id,
    summary: `${disabled ? "Disabled" : "Re-enabled"} ${target.email}`,
    payload: { disabled },
  });
}
