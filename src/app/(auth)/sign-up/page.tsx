"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signUp } from "@/lib/auth-client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await signUp.email({ name, email, password });
      if (r.error) setError(r.error.message ?? "Sign-up failed");
      else router.push("/dashboard");
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <h1 className="text-lg font-semibold">Create account</h1>
      <div className="space-y-1.5">
        <Label htmlFor="name">Name</Label>
        <Input id="name" required value={name} onChange={e => setName(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password (min 8)</Label>
        <Input id="password" type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} />
      </div>
      {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Creating…" : "Create account"}
      </Button>
      <div className="text-center text-xs text-[var(--color-text-3)]">
        Have an account? <Link className="underline" href="/sign-in">Sign in</Link>
      </div>
    </form>
  );
}
