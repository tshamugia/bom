"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Asks the server which code a record would get, a moment after typing stops.
 * `input` null means there is nothing to ask yet (no name). The server assigns
 * the real code on save, so this is only a preview.
 */
export function useSuggestedCode<I>(action: (input: I) => Promise<string>, input: I | null) {
  const key = input === null ? null : JSON.stringify(input);
  const [result, setResult] = useState<{ key: string; code: string } | null>(null);

  useEffect(() => {
    if (key === null) return;
    let live = true;
    const handle = setTimeout(() => {
      action(JSON.parse(key) as I).then(
        code => { if (live) setResult({ key, code }); },
        () => { if (live) setResult({ key, code: "" }); },
      );
    }, 250);
    return () => {
      live = false;
      clearTimeout(handle);
    };
  }, [action, key]);

  if (key === null) return { code: "", loading: false };
  // Until the answer for this name arrives, keep showing the last one.
  return { code: result?.code ?? "", loading: result?.key !== key };
}

/** The code input is read-only: codes come from the name, nobody types them. */
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
