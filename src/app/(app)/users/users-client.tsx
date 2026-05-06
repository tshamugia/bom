"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { createUser, setUserDisabled } from "@/server/actions/users";

type Role = "owner" | "admin" | "member";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: Role;
  disabled: boolean;
  createdAt: string;
};

export function UsersClient({
  callerRole,
  callerId,
  users,
}: {
  callerRole: Role;
  callerId: string;
  users: UserRow[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "member" as Role });

  const assignableRoles: Role[] =
    callerRole === "owner" ? ["owner", "admin", "member"] : ["member"];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      try {
        await createUser(form);
        setForm({ name: "", email: "", password: "", role: "member" });
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create user");
      }
    });
  }

  function toggleDisabled(u: UserRow) {
    start(async () => {
      try {
        await setUserDisabled({ id: u.id, disabled: !u.disabled });
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update user");
      }
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <form
        onSubmit={submit}
        className="space-y-3 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-4"
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
          <Input id="u-password" type="password" required minLength={8} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="u-role">Role</Label>
          <select
            id="u-role"
            value={form.role}
            onChange={e => setForm({ ...form, role: e.target.value as Role })}
            className="flex h-9 w-full rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-1 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-soft)]"
          >
            {assignableRoles.map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
        {error && <p className="text-[12.5px] text-[var(--color-danger)]">{error}</p>}
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Working…" : "Create user"}
        </Button>
      </form>

      <div className="overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)]">
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
            {users.map(u => (
              <tr key={u.id} className="border-b border-[var(--color-line-soft)] last:border-0">
                <td className="px-3 py-2.5">{u.name}</td>
                <td className="px-3 py-2.5 text-[var(--color-text-2)]">{u.email}</td>
                <td className="px-3 py-2.5">
                  <Badge tone={u.role === "owner" ? "accent" : u.role === "admin" ? "info" : "gray"}>
                    <span className="capitalize">{u.role}</span>
                  </Badge>
                </td>
                <td className="px-3 py-2.5">
                  {u.disabled
                    ? <Badge tone="danger">Disabled</Badge>
                    : <Badge tone="success">Active</Badge>}
                </td>
                <td className="px-3 py-2.5 text-right">
                  {u.id !== callerId && (u.role !== "owner" || callerRole === "owner") && (
                    <Button size="sm" variant="outline" onClick={() => toggleDisabled(u)} disabled={pending}>
                      {u.disabled ? "Re-enable" : "Disable"}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
