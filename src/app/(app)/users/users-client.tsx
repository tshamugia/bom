"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { USER_ROLES, type UserRole } from "@/lib/roles";
import { createUser, setUserDisabled, setUserRole } from "@/server/actions/users";
import { ResetPasswordDialog, generateTempPassword } from "./reset-password-dialog";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  disabled: boolean;
  createdAt: string;
};

const ROLE_HINT: Record<UserRole, string> = {
  admin: "Full access: users, settings, audit log and deleting projects, BOMs, vendors and drawings.",
  member: "Creates and edits everything, but can't delete projects, BOMs, vendors or drawings, or change settings.",
  viewer: "Read-only: sees dashboards, projects, BOMs, drawings and history, but can't create, edit or delete anything.",
};

const ROLE_NOUN: Record<UserRole, string> = { admin: "an admin", member: "a member", viewer: "a viewer" };
const ROLE_TONE: Record<UserRole, "info" | "gray" | "teal"> = { admin: "info", member: "gray", viewer: "teal" };

const SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-1 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-soft)]";

export function UsersClient({ callerId, users }: { callerId: string; users: UserRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "member" as UserRole });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      try {
        const r = await createUser(form);
        if (r.emailStatus === "sent") toast.success(`${form.email} was created and emailed their password.`);
        else toast.warning(`${form.email} was created, but the welcome email wasn't sent — share the password yourself.`, { duration: 10_000 });
        setForm({ name: "", email: "", password: "", role: "member" });
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create user");
      }
    });
  }

  function toggleDisabled(u: UserRow) {
    if (!u.disabled && !confirm(`Disable ${u.email}? They are signed out immediately and can't sign in until re-enabled.`)) return;
    start(async () => {
      try {
        await setUserDisabled({ id: u.id, disabled: !u.disabled });
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update user");
      }
    });
  }

  function changeRole(u: UserRow, role: UserRole) {
    if (role === u.role) return;
    if (!confirm(`Make ${u.email} ${ROLE_NOUN[role]}?`)) return;
    start(async () => {
      try {
        await setUserRole({ id: u.id, role });
        toast.success(`${u.email} is now ${ROLE_NOUN[role]}`);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to change role");
      }
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <form
        onSubmit={submit}
        className="space-y-3 self-start rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-4"
      >
        <h2 className="text-[14px] font-semibold tracking-tight">Create user</h2>
        <div className="space-y-1.5">
          <Label htmlFor="u-name">Name</Label>
          <Input id="u-name" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="u-email">Email</Label>
          <Input id="u-email" type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="u-password">Temporary password</Label>
          <div className="flex gap-2">
            <Input
              id="u-password"
              className="font-mono"
              autoComplete="off"
              spellCheck={false}
              required
              minLength={8}
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
            />
            <Button type="button" variant="outline" onClick={() => setForm({ ...form, password: generateTempPassword() })}>
              Generate
            </Button>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="u-role">Role</Label>
          <select
            id="u-role"
            value={form.role}
            onChange={e => setForm({ ...form, role: e.target.value as UserRole })}
            className={SELECT_CLASS}
          >
            {USER_ROLES.map(r => (
              <option key={r} value={r} className="capitalize">{r}</option>
            ))}
          </select>
          <p className="text-[12px] text-[var(--color-text-3)]">{ROLE_HINT[form.role]}</p>
        </div>
        {error && <p className="text-[12.5px] text-[var(--color-danger)]">{error}</p>}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Working…" : "Create user"}
        </Button>
      </form>

      <div className="overflow-x-auto rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)]">
        <table className="w-full text-[13px]">
          <thead className="border-b border-[var(--color-line)] bg-[var(--color-surface-2)] text-left text-[12px] font-semibold uppercase tracking-wide text-[var(--color-text-3)]">
            <tr>
              <th className="px-3 py-2.5">Name</th>
              <th className="px-3 py-2.5">Email</th>
              <th className="px-3 py-2.5">Role</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => {
              const self = u.id === callerId;
              return (
                <tr key={u.id} className="border-b border-[var(--color-line-soft)] last:border-0">
                  <td className="px-3 py-2.5">
                    {u.name}
                    {self && <span className="ml-1.5 text-[11.5px] text-[var(--color-text-3)]">(you)</span>}
                  </td>
                  <td className="px-3 py-2.5 text-[var(--color-text-2)]">{u.email}</td>
                  <td className="px-3 py-2.5">
                    {self ? (
                      <Badge tone={ROLE_TONE[u.role]}>
                        <span className="capitalize">{u.role}</span>
                      </Badge>
                    ) : (
                      <select
                        aria-label={`Role for ${u.email}`}
                        value={u.role}
                        disabled={pending}
                        onChange={e => changeRole(u, e.target.value as UserRole)}
                        className={`${SELECT_CLASS} h-8 w-auto capitalize`}
                      >
                        {USER_ROLES.map(r => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {u.disabled
                      ? <Badge tone="danger">Disabled</Badge>
                      : <Badge tone="success">Active</Badge>}
                  </td>
                  <td className="px-3 py-2.5">
                    {!self && (
                      <div className="flex items-center justify-end gap-1.5">
                        <ResetPasswordDialog userId={u.id} name={u.name} email={u.email} />
                        <Button size="sm" variant="outline" onClick={() => toggleDisabled(u)} disabled={pending}>
                          {u.disabled ? "Re-enable" : "Disable"}
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="border-t border-[var(--color-line-soft)] px-3 py-2.5 text-[12px] text-[var(--color-text-3)]">
          To change your own password use Settings → Profile. Your own role and status can only be changed by another admin.
        </p>
      </div>
    </div>
  );
}
