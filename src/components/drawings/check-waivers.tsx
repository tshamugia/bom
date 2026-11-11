"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { checkRule } from "@/lib/drawing-check-rules";
import { removeDrawingCheckWaiver } from "@/server/actions/drawing-check-settings";
import type { CheckWaiverRow } from "@/server/queries/drawing-checks";

function WaiverItem({ w, canRemove, showDrawing }: { w: CheckWaiverRow; canRemove: boolean; showDrawing: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  const remove = () =>
    start(async () => {
      const res = await removeDrawingCheckWaiver({ id: w.id });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${w.ruleId} is checked again on ${w.drawingCode}`);
      router.refresh();
    });

  return (
    <li className="grid gap-1 px-4 py-2.5" style={{ borderTop: "1px solid var(--line-soft)" }}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="mono text-[11.5px]">{w.ruleId}</span>
        {showDrawing && (
          <Link href={`/drawings/${w.drawingId}#dxf-check`} className="mono text-[11.5px] hover:underline">
            {w.projectCode} · {w.drawingCode}
          </Link>
        )}
        <span className="muted text-[11.5px]">{w.createdByName ?? "—"} · {formatDateTime(w.createdAt)}</span>
        <span className="spacer" />
        {canRemove && !confirming && (
          <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>Remove</Button>
        )}
      </div>
      {checkRule(w.ruleId) && <div className="text-[13px] [overflow-wrap:anywhere]">{checkRule(w.ruleId)!.title}</div>}
      <div className="whitespace-pre-line text-[12.5px] text-[var(--color-text-2)] [overflow-wrap:anywhere]">“{w.reason}”</div>
      {confirming && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="muted mr-auto text-[12px]">The next check of this drawing runs {w.ruleId} again.</span>
          <Button size="sm" variant="outline" onClick={() => setConfirming(false)} disabled={pending}>Cancel</Button>
          <Button size="sm" onClick={remove} disabled={pending}>{pending ? "Removing…" : "Remove false error"}</Button>
        </div>
      )}
    </li>
  );
}

/**
 * Rules marked as a false error — on the drawing's check card, and all of them
 * in Settings. Only admins take one back.
 */
export function CheckWaivers({
  waivers,
  canRemove,
  showDrawing = false,
}: {
  waivers: CheckWaiverRow[];
  canRemove: boolean;
  showDrawing?: boolean;
}) {
  return (
    <ul className="m-0 list-none p-0">
      {waivers.map(w => <WaiverItem key={w.id} w={w} canRemove={canRemove} showDrawing={showDrawing} />)}
    </ul>
  );
}
