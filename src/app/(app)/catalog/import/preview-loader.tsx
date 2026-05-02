"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DryRunCounts } from "@/components/import/dry-run-counts";
import { AutoCreatePanel } from "@/components/import/auto-create-panel";
import { ErrorTable } from "@/components/import/error-table";
import { CommitBar } from "@/components/import/commit-bar";
import { commitImport } from "@/server/actions/import";
import type { DuplicatePolicy } from "@/lib/schemas/import";
import type { GetDryRunResult } from "@/server/queries/import";

export function PreviewLoader({ importId, initial }: { importId: string; initial: GetDryRunResult }) {
  const router = useRouter();
  const [duplicates, setDuplicates] = useState<DuplicatePolicy>("skip");
  const [pending, start] = useTransition();

  function commit() {
    start(async () => {
      const r = await commitImport({ importId, duplicates });
      if (!r.ok) {
        toast.error(r.error === "expired" ? "Session expired — please re-upload." : `Import failed: ${r.error}`);
        if (r.error === "expired") router.replace("/catalog/import");
        return;
      }
      const { added, updated, errored } = r.counts;
      const link = r.errorsFileUrl ? ` — Download errors.xlsx: ${r.errorsFileUrl}` : "";
      toast.success(`${added} added · ${updated} updated · ${errored} errors${link}`, { duration: 8000 });
      router.replace("/catalog");
    });
  }

  if (!initial.ok) {
    if (initial.error === "expired") {
      return (
        <div className="rounded-lg border border-amber-300/60 bg-amber-50/50 p-3 text-[12.5px]">
          Session expired. <a className="underline" href="/catalog/import">Re-upload</a>.
        </div>
      );
    }
    return <div className="text-[12.5px] text-red-600">Error: {initial.error}</div>;
  }

  const { result } = initial;
  const noValidRows = result.counts.toAdd + result.counts.toUpdate === 0;
  return (
    <div className="space-y-3">
      <DryRunCounts result={result} />
      <AutoCreatePanel result={result} />
      <ErrorTable rows={result.errorRows} />
      <CommitBar
        duplicates={duplicates}
        onDuplicatesChange={setDuplicates}
        pending={pending}
        disabled={noValidRows}
        onSubmit={commit}
      />
    </div>
  );
}
