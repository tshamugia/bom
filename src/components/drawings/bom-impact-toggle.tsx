"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { setDrawingRevisionBomImpact } from "@/server/actions/drawings";

/** Lets an editor correct whether the current revision changes the BOM. */
export function BomImpactToggle({ revisionId, bomImpact }: { revisionId: string; bomImpact: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();

  const flip = () =>
    start(async () => {
      const res = await setDrawingRevisionBomImpact({ revisionId, bomImpact: !bomImpact });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(bomImpact ? "Marked as no BOM change" : "Marked as changing the BOM");
      router.refresh();
    });

  return (
    <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={flip}>
      {bomImpact ? "Mark as no BOM change" : "Mark as changing the BOM"}
    </button>
  );
}
