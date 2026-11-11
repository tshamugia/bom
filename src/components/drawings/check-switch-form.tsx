"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { BlockedNote } from "@/components/help/blocked-note";
import { setDrawingCheckEnabled } from "@/server/actions/drawing-settings";

/** The admin switch for automatic DXF checks; rules and parameters are on /settings/drawing-checks. */
export function CheckSwitchForm({ initial, configured }: { initial: boolean; configured: boolean }) {
  const [enabled, setEnabled] = useState(initial);
  const [pending, start] = useTransition();
  const router = useRouter();

  const save = () =>
    start(async () => {
      const res = await setDrawingCheckEnabled({ enabled });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(enabled ? "Automatic DXF checks turned on" : "Automatic DXF checks turned off");
      router.refresh();
    });

  return (
    <div className="grid gap-3">
      <label className="flex cursor-pointer items-start gap-2 text-[12.5px]">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={enabled}
          onChange={e => setEnabled(e.target.checked)}
        />
        <span className="grid gap-0.5">
          <span className="font-medium">Check DXFs uploaded to drawings</span>
          <span className="muted">
            Editors upload a DXF of a drawing&apos;s latest revision; the findings become remarks. Off: the drawing page says so and uploads are refused.
          </span>
        </span>
      </label>
      {!configured && (
        <BlockedNote topic="drawing-check">
          The checker isn&apos;t connected to this server: DXF_CHECKER_URL, DXF_CHECKER_SECRET and APP_INTERNAL_URL must be set on the app. Until then nothing can be checked, even when this is on.
        </BlockedNote>
      )}
      <div>
        <Button onClick={save} disabled={pending || enabled === initial}>{pending ? "Saving…" : "Save"}</Button>
      </div>
    </div>
  );
}
