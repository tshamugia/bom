"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, Loader2, Mail, MailCheck } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await authClient.requestPasswordReset({ email: email.trim(), redirectTo: "/reset-password" });
      if (r.error) {
        setError(r.error.status === 429 ? "Too many attempts. Wait a minute and try again." : "Couldn't send the request. Try again.");
        return;
      }
      setSent(true);
    });
  }

  if (sent) {
    return (
      <div className="space-y-5">
        <div className="grid size-10 place-items-center rounded-full bg-[var(--color-success-soft,var(--color-surface-2))] text-[var(--color-success)]">
          <MailCheck className="size-5" aria-hidden />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-[18px] font-semibold tracking-tight">Check your email</h1>
          <p className="text-[13px] leading-relaxed text-[var(--color-text-3)]">
            If <span className="font-medium text-[var(--color-text-2)]">{email.trim()}</span> is an admin account,
            a reset link is on its way. It works for one hour.
          </p>
          <p className="text-[13px] leading-relaxed text-[var(--color-text-3)]">
            Members don&apos;t get a link — ask an admin to reset your password from the Users page.
          </p>
        </div>
        <BackToSignIn />
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-[18px] font-semibold tracking-tight">Forgot your password?</h1>
        <p className="text-[13px] text-[var(--color-text-3)]">
          Admins get a reset link by email. Members: ask an admin to reset it for you.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <div className="relative">
          <Mail
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-[var(--color-text-4)]"
          />
          <Input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="off"
            spellCheck={false}
            autoFocus
            required
            disabled={pending}
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="h-9 pl-8"
            placeholder="you@company.com"
          />
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-md border border-[var(--color-danger)]/25 bg-[var(--color-danger-soft)] px-2.5 py-2 text-[13px] text-[var(--color-danger)]">
          <AlertCircle aria-hidden className="mt-px size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={pending || !email.trim()}
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg text-[14px] font-medium text-white transition-all hover:brightness-[1.06] focus-visible:ring-3 focus-visible:ring-[var(--color-accent)]/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-70"
        style={{ backgroundImage: "linear-gradient(135deg, #5562ff 0%, #8a5cff 100%)" }}
      >
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden /> Sending…
          </>
        ) : (
          "Send reset link"
        )}
      </button>

      <BackToSignIn />
    </form>
  );
}

function BackToSignIn() {
  return (
    <Link
      href="/sign-in"
      className="inline-flex items-center gap-1.5 text-[13px] text-[var(--color-text-2)] hover:text-[var(--color-text)]"
    >
      <ArrowLeft className="size-3.5" aria-hidden /> Back to sign in
    </Link>
  );
}
