"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { DuplicatePolicy } from "@/lib/schemas/import";
import { DuplicatePolicyRadio } from "./duplicate-policy-radio";

export function CommitBar({
  duplicates,
  onDuplicatesChange,
  pending,
  disabled,
  onSubmit,
}: {
  duplicates: DuplicatePolicy;
  onDuplicatesChange: (v: DuplicatePolicy) => void;
  pending: boolean;
  disabled: boolean;
  onSubmit: () => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3">
      <DuplicatePolicyRadio value={duplicates} onChange={onDuplicatesChange} disabled={pending} />
      <div className="flex items-center gap-2">
        <Link href="/catalog"><Button variant="outline" disabled={pending}>Cancel</Button></Link>
        <Button onClick={onSubmit} disabled={pending || disabled}>{pending ? "Importing…" : "Import"}</Button>
      </div>
    </div>
  );
}
