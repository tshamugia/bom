import { beforeEach, expect, test, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { resetDb, ensureUser } from "@/../tests/test-helpers/db";
import { mockSession } from "@/../tests/test-helpers/auth";
import { db } from "@/db/client";
import { account, auditLog, session as sessionTable, user } from "@/db/schema";
import { auth } from "@/lib/auth";
import { createUserDirect } from "@/server/lib/create-user-direct";
import { resetUserPassword, setUserDisabled, setUserRole } from "@/server/actions/users";

vi.mock("@/server/auth-context", () => ({ requireSession: vi.fn(), requireRole: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/mailer", () => ({
  sendWelcomeEmail: vi.fn(async () => ({ sent: false, reason: "SMTP_NOT_CONFIGURED" })),
  sendPasswordResetByAdminEmail: vi.fn(async () => ({ sent: true })),
}));

beforeEach(async () => { await resetDb(); });

async function memberWithSession() {
  const { id } = await createUserDirect({ email: `m-${Date.now()}@example.com`, password: "OldPassword1", name: "Member", role: "member" });
  await db.insert(sessionTable).values({
    id: `s-${id}`, userId: id, token: `t-${id}`, expiresAt: new Date(Date.now() + 86_400_000),
  });
  return id;
}

async function passwordHash(userId: string) {
  const [a] = await db
    .select({ password: account.password })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential")));
  return a?.password ?? null;
}

test("resetUserPassword sets the new password, signs the user out and is audited", async () => {
  await mockSession("admin");
  const target = await memberWithSession();

  const r = await resetUserPassword({ id: target, password: "BrandNew12345" });
  expect(r.emailStatus).toBe("sent");

  const ctx = await auth.$context;
  const hash = await passwordHash(target);
  expect(await ctx.password.verify({ hash: hash!, password: "BrandNew12345" })).toBe(true);
  expect(await ctx.password.verify({ hash: hash!, password: "OldPassword1" })).toBe(false);
  expect(await db.select().from(sessionTable).where(eq(sessionTable.userId, target))).toHaveLength(0);
  const [flag] = await db.select({ must: user.mustChangePassword }).from(user).where(eq(user.id, target));
  expect(flag.must).toBe(true);

  const [row] = await db.select().from(auditLog).where(eq(auditLog.kind, "user.password.reset"));
  expect(row.refId).toBe(target);
});

test("resetUserPassword refuses a password shorter than 12 characters", async () => {
  await mockSession("admin");
  const target = await memberWithSession();
  await expect(resetUserPassword({ id: target, password: "Short12345" })).rejects.toThrow();
});

test("new accounts start with a temporary password", async () => {
  const id = await memberWithSession();
  const [row] = await db.select({ must: user.mustChangePassword }).from(user).where(eq(user.id, id));
  expect(row.must).toBe(true);
});

test("resetUserPassword: members can't, and admins use Profile for their own", async () => {
  const target = await memberWithSession();
  await mockSession("member");
  await expect(resetUserPassword({ id: target, password: "BrandNew12345" })).rejects.toThrow(/FORBIDDEN/);

  const { user: me } = await mockSession("admin");
  await expect(resetUserPassword({ id: me.id, password: "BrandNew12345" })).rejects.toThrow(/USE_PROFILE/);
});

test("setUserRole promotes a member and refuses to change your own role", async () => {
  const { user: me } = await mockSession("admin");
  const other = await ensureUser("member");

  await setUserRole({ id: other.id, role: "admin" });
  const [after] = await db.select({ role: user.role }).from(user).where(eq(user.id, other.id));
  expect(after.role).toBe("admin");
  const [row] = await db.select().from(auditLog).where(eq(auditLog.kind, "user.role.changed"));
  expect(row.payload).toMatchObject({ from: "member", to: "admin" });

  await expect(setUserRole({ id: me.id, role: "member" })).rejects.toThrow(/CANNOT_CHANGE_OWN_ROLE/);
});

test("setUserRole is admin-only", async () => {
  const other = await ensureUser("member");
  await mockSession("member");
  await expect(setUserRole({ id: other.id, role: "admin" })).rejects.toThrow(/FORBIDDEN/);
});

test("disabling a user ends their sessions", async () => {
  await mockSession("admin");
  const target = await memberWithSession();
  await setUserDisabled({ id: target, disabled: true });
  expect(await db.select().from(sessionTable).where(eq(sessionTable.userId, target))).toHaveLength(0);
});
