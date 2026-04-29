"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";

function VerifyInner() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const token = params.get("token");
    if (!token) return;
    authClient.magicLink.verify({ query: { token } }).then(r => {
      router.push(r.error ? "/sign-in" : "/dashboard");
    });
  }, [params, router]);

  return <p className="text-sm text-[var(--color-text-3)]">Verifying your link…</p>;
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<p className="text-sm text-[var(--color-text-3)]">Verifying your link…</p>}>
      <VerifyInner />
    </Suspense>
  );
}
