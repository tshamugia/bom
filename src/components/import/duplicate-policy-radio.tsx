"use client";
import type { DuplicatePolicy } from "@/lib/schemas/import";

export function DuplicatePolicyRadio({
  value,
  onChange,
  disabled,
}: {
  value: DuplicatePolicy;
  onChange: (v: DuplicatePolicy) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="flex items-center gap-4 text-[12.5px]">
      <legend className="mr-2 text-[var(--color-text-3)]">When a SKU already exists:</legend>
      <label className="flex items-center gap-1.5">
        <input type="radio" name="dup" disabled={disabled} checked={value === "skip"} onChange={() => onChange("skip")} />
        Skip
      </label>
      <label className="flex items-center gap-1.5">
        <input type="radio" name="dup" disabled={disabled} checked={value === "update"} onChange={() => onChange("update")} />
        Update
      </label>
    </fieldset>
  );
}
