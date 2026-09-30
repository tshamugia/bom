"use client";

import { Suspense, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, ArrowLeft, Loader2, Lock } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { PASSWORD_MIN_LENGTH as MIN_LENGTH } from "@/lib/password-policy";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  const linkBroken = !token || params.get("error") === "INVALID_TOKEN";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (linkBroken) {
    return (
      <div className="space-y-5">
        <div className="space-y-1.5">
          <h1 className="text-[18px] font-semibold tracking-tight">This link doesn&apos;t work</h1>
          <p className="text-[13px] leading-relaxed text-[var(--color-text-3)]">
            Reset links expire after an hour and can be used once. Ask for a new one.
          </p>
        </div>
        <Link href="/forgot-password" className="text-[13px] font-medium text-[var(--color-accent)] hover:underline">
          Send a new link
        </Link>
      </div>
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_LENGTH) return setError(`Use at least ${MIN_LENGTH} characters.`);
    if (password !== confirm) return setError("The passwords don't match.");
    start(async () => {
      const r = await authClient.resetPassword({ newPassword: password, token: token! });
      if (r.error) {
        setError(
          r.error.code === "INVALID_TOKEN"
            ? "This link has expired or was already used. Ask for a new one."
            : r.error.message ?? "Couldn't reset the password.",
        );
        return;
      }
      router.replace("/sign-in?reset=1");
    });
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-[18px] font-semibold tracking-tight">Choose a new password</h1>
        <p className="text-[13px] text-[var(--color-text-3)]">You&apos;ll be signed out everywhere and can sign in with the new one.</p>
      </div>

      <div className="space-y-3.5">
        <PasswordField id="new-password" label="New password" value={password} onChange={setPassword} disabled={pending} autoFocus />
        <PasswordField id="confirm-password" label="Repeat new password" value={confirm} onChange={setConfirm} disabled={pending} />
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-md border border-[var(--color-danger)]/25 bg-[var(--color-danger-soft)] px-2.5 py-2 text-[13px] text-[var(--color-danger)]">
          <AlertCircle aria-hidden className="mt-px size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={pending || !password || !confirm}
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg text-[14px] font-medium text-white transition-all hover:brightness-[1.06] focus-visible:ring-3 focus-visible:ring-[var(--color-accent)]/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-70"
        style={{ backgroundImage: "linear-gradient(135deg, #5562ff 0%, #8a5cff 100%)" }}
      >
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden /> Saving…
          </>
        ) : (
          "Set new password"
        )}
      </button>

      <Link
        href="/sign-in"
        className="inline-flex items-center gap-1.5 text-[13px] text-[var(--color-text-2)] hover:text-[var(--color-text)]"
      >
        <ArrowLeft className="size-3.5" aria-hidden /> Back to sign in
      </Link>
    </form>
  );
}

function PasswordField({
  id, label, value, onChange, disabled, autoFocus,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  autoFocus?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Lock
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-[var(--color-text-4)]"
        />
        <Input
          id={id}
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_LENGTH}
          autoFocus={autoFocus}
          disabled={disabled}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="h-9 pl-8"
        />
      </div>
    </div>
  );
}
