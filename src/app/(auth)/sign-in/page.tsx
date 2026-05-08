"use client";

import { Suspense, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react";
import { signIn } from "@/lib/auth-client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export default function SignInPage() {
  return (
    <Suspense fallback={<SignInFormFallback />}>
      <SignInForm />
    </Suspense>
  );
}

function SignInFormFallback() {
  return (
    <div className="space-y-5" aria-hidden>
      <div className="space-y-1">
        <div className="h-[22px] w-20 rounded bg-[var(--color-surface-2)]" />
        <div className="h-[18px] w-56 rounded bg-[var(--color-surface-2)]" />
      </div>
      <div className="space-y-3.5">
        <div className="h-[58px] rounded bg-[var(--color-surface-2)]" />
        <div className="h-[58px] rounded bg-[var(--color-surface-2)]" />
      </div>
      <div className="h-9 rounded-lg bg-[var(--color-surface-2)]" />
    </div>
  );
}

function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/projects";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onPasswordKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (typeof e.getModifierState === "function") {
      setCapsLock(e.getModifierState("CapsLock"));
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await signIn.email({ email: email.trim(), password });
      if (r.error) {
        setError("Invalid email or password.");
        return;
      }
      router.push(next);
      router.refresh();
    });
  }

  const invalid = !!error;

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-[18px] font-semibold tracking-tight">Sign in</h1>
        <p className="text-[13px] text-[var(--color-text-3)]">
          Welcome back. Enter your credentials to continue.
        </p>
      </div>

      <div className="space-y-3.5">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-[var(--color-text-4)]"
            />
            <Input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
              required
              disabled={pending}
              aria-invalid={invalid || undefined}
              aria-describedby={invalid ? "auth-error" : undefined}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-9 pl-8"
              placeholder="you@company.com"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Lock
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-[var(--color-text-4)]"
            />
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              disabled={pending}
              aria-invalid={invalid || undefined}
              aria-describedby={invalid ? "auth-error" : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={onPasswordKey}
              onKeyUp={onPasswordKey}
              className="h-9 pr-9 pl-8"
              placeholder="••••••••"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              tabIndex={-1}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              className="absolute top-1/2 right-1 grid size-7 -translate-y-1/2 place-items-center rounded-md text-[var(--color-text-3)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/30 focus-visible:outline-none"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {capsLock && (
            <p className="flex items-center gap-1.5 text-[12px] text-[var(--color-warning)]">
              <AlertCircle className="size-3.5" aria-hidden />
              Caps Lock is on.
            </p>
          )}
        </div>
      </div>

      <div
        id="auth-error"
        role="alert"
        aria-live="polite"
        className={cn(
          "overflow-hidden transition-all",
          error ? "max-h-20 opacity-100" : "max-h-0 opacity-0"
        )}
      >
        {error && (
          <div className="flex items-start gap-2 rounded-md border border-[var(--color-danger)]/25 bg-[var(--color-danger-soft)] px-2.5 py-2 text-[13px] text-[var(--color-danger)]">
            <AlertCircle aria-hidden className="mt-px size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="group relative inline-flex h-10 w-full items-center justify-center gap-2 overflow-hidden rounded-lg text-[14px] font-medium text-white shadow-[0_1px_0_rgba(255,255,255,0.18)_inset,0_1px_2px_rgba(15,18,34,0.12),0_4px_14px_-4px_rgba(79,70,229,0.55)] transition-all hover:shadow-[0_1px_0_rgba(255,255,255,0.22)_inset,0_2px_4px_rgba(15,18,34,0.14),0_8px_22px_-6px_rgba(79,70,229,0.7)] focus-visible:ring-3 focus-visible:ring-[var(--color-accent)]/40 focus-visible:outline-none active:translate-y-px disabled:cursor-not-allowed disabled:opacity-80"
        style={{
          backgroundImage:
            "linear-gradient(180deg, #6366f1 0%, #4f46e5 55%, #4338ca 100%)",
        }}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/20 to-transparent opacity-90"
        />
        <span className="relative inline-flex items-center gap-2">
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Signing in…
            </>
          ) : (
            "Sign in"
          )}
        </span>
      </button>
    </form>
  );
}
