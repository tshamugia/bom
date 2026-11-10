"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Calls a server action a moment after `input` stops changing and keeps the
 * latest answer. `input` null means there is nothing to ask yet.
 */
export function useDebouncedAction<I, R>(action: (input: I) => Promise<R>, input: I | null, fallback: R) {
  const key = input === null ? null : JSON.stringify(input);
  const [result, setResult] = useState<{ key: string; value: R } | null>(null);
  // A new fallback literal on every render must not re-run the call.
  const fallbackRef = useRef(fallback);

  useEffect(() => {
    if (key === null) return;
    let live = true;
    const handle = setTimeout(() => {
      action(JSON.parse(key) as I).then(
        value => { if (live) setResult({ key, value }); },
        () => { if (live) setResult({ key, value: fallbackRef.current }); },
      );
    }, 250);
    return () => {
      live = false;
      clearTimeout(handle);
    };
  }, [action, key]);

  if (key === null) return { value: fallback, loading: false, stale: false };
  // Until the answer for this input arrives, keep showing the last one.
  return { value: result?.value ?? fallback, loading: result?.key !== key, stale: !!result && result.key !== key };
}

/**
 * Asks the server which code a record would get. The server assigns the real
 * code on save, so this is only a preview.
 */
export function useSuggestedCode<I>(action: (input: I) => Promise<string>, input: I | null) {
  const { value, loading } = useDebouncedAction(action, input, "");
  return { code: value, loading };
}

/** A read-only code input: drawing codes come from the name, nobody types them. */
export function CodeField({
  id,
  value,
  loading = false,
  label = "Code",
}: {
  id: string;
  value: string;
  loading?: boolean;
  label?: string;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        disabled
        aria-busy={loading}
        placeholder={loading ? "…" : "From the name"}
        className="font-mono disabled:opacity-100 disabled:text-[var(--color-text-2)]"
      />
    </div>
  );
}
