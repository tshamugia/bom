"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { PASSWORD_MIN_LENGTH as MIN_LENGTH } from "@/lib/password-policy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** `required`: the current password is a temporary one from an admin — the app opens once it's replaced. */
export function ChangePasswordForm({ required = false }: { required?: boolean }) {
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next.length < MIN_LENGTH) return setError(`The new password needs at least ${MIN_LENGTH} characters.`);
    if (next !== confirm) return setError("The new passwords don't match.");
    if (next === current) return setError("Pick a password different from the current one.");

    start(async () => {
      const r = await authClient.changePassword({
        currentPassword: current,
        newPassword: next,
        revokeOtherSessions: true,
      });
      if (r.error) {
        setError(
          r.error.code === "INVALID_PASSWORD"
            ? "The current password is wrong."
            : r.error.message ?? "Couldn't change the password.",
        );
        return;
      }
      setCurrent("");
      setNext("");
      setConfirm("");
      toast.success("Password changed. Other devices were signed out.");
      if (required) router.replace("/");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-3" noValidate>
      <div className="grid gap-1.5">
        <Label htmlFor="pw-current">Current password</Label>
        <Input id="pw-current" type="password" autoComplete="current-password" required value={current} onChange={e => setCurrent(e.target.value)} disabled={pending} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="pw-new">New password</Label>
          <Input id="pw-new" type="password" autoComplete="new-password" required minLength={MIN_LENGTH} value={next} onChange={e => setNext(e.target.value)} disabled={pending} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pw-confirm">Repeat new password</Label>
          <Input id="pw-confirm" type="password" autoComplete="new-password" required value={confirm} onChange={e => setConfirm(e.target.value)} disabled={pending} />
        </div>
      </div>
      {error && <p role="alert" className="text-[12.5px] text-[var(--color-danger)]">{error}</p>}
      <div>
        <Button type="submit" disabled={pending || !current || !next || !confirm}>
          {pending ? "Saving…" : "Change password"}
        </Button>
      </div>
    </form>
  );
}
