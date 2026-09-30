"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Icon } from "@/components/icons";
import { PASSWORD_MIN_LENGTH } from "@/lib/password-policy";
import { resetUserPassword } from "@/server/actions/users";

// No look-alike characters (0/O, 1/l/I) — people type this from an email.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

export function generateTempPassword(length = PASSWORD_MIN_LENGTH + 2): string {
  const bytes = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join("");
}

export function ResetPasswordDialog({ userId, name, email }: { userId: string; name: string; email: string }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < PASSWORD_MIN_LENGTH) return setError(`Use at least ${PASSWORD_MIN_LENGTH} characters.`);
    start(async () => {
      try {
        const r = await resetUserPassword({ id: userId, password });
        setOpen(false);
        if (r.emailStatus === "sent") {
          toast.success(`Password reset. ${email} was emailed the new password.`);
        } else {
          toast.warning(
            `Password reset, but the email ${r.emailStatus === "skipped" ? "is not configured" : "failed"} — give ${name} the new password yourself.`,
            { duration: 10_000 },
          );
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Reset failed");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        setOpen(next);
        if (next) {
          setPassword(generateTempPassword());
          setError(null);
        }
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm" variant="outline" title={`Reset password for ${name}`}>
            <Icon.Key size={14} className="mr-1" /> Reset password
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>
              {name} ({email}) gets this temporary password by email, is signed out on every device and has to pick a new one at the next sign-in.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="rp-password">Temporary password</Label>
            <div className="flex gap-2">
              <Input
                id="rp-password"
                className="font-mono"
                autoComplete="off"
                spellCheck={false}
                value={password}
                minLength={PASSWORD_MIN_LENGTH}
                maxLength={128}
                onChange={e => setPassword(e.target.value)}
                disabled={pending}
              />
              <Button type="button" variant="outline" onClick={() => setPassword(generateTempPassword())} disabled={pending}>
                New
              </Button>
            </div>
            <p className="text-[12px] text-[var(--color-text-3)]">
              Copy it before saving if email isn&apos;t set up — you&apos;ll need to hand it over yourself.
            </p>
          </div>
          {error && <p role="alert" className="text-[12.5px] text-[var(--color-danger)]">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
            <Button type="submit" disabled={pending || password.length < PASSWORD_MIN_LENGTH}>
              {pending ? "Resetting…" : "Reset password"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
