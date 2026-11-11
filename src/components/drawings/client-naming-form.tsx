"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { BlockedNote } from "@/components/help/blocked-note";
import { setProjectClientNaming } from "@/server/actions/drawing-check-settings";

/** The project page's switch for NAMING §1: the client's file naming replaces the standard's. */
export function ClientNamingForm({ projectId, initial, readOnly }: { projectId: string; initial: boolean; readOnly: boolean }) {
  const [enabled, setEnabled] = useState(initial);
  const [pending, start] = useTransition();
  const router = useRouter();

  const save = () =>
    start(async () => {
      const res = await setProjectClientNaming({ projectId, enabled });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(enabled ? "File-name rules are off for this project" : "File-name rules are on again for this project");
      router.refresh();
    });

  return (
    <div className="grid gap-3">
      <label className={`flex items-start gap-2 text-[12.5px] ${readOnly ? "" : "cursor-pointer"}`}>
        <input type="checkbox" className="mt-0.5" checked={enabled} disabled={readOnly} onChange={e => setEnabled(e.target.checked)} />
        <span className="grid gap-0.5">
          <span className="font-medium">The client&apos;s file naming applies</span>
          <span className="muted">
            NAMING §1: the client&apos;s naming comes first. Checks of this project&apos;s DXFs skip the file name, the codes in it and its revision; the title block and the drawing are still checked.
          </span>
        </span>
      </label>
      {readOnly ? (
        <BlockedNote topic="drawing-check-settings">Only an admin changes this.</BlockedNote>
      ) : (
        <div>
          <Button onClick={save} disabled={pending || enabled === initial}>{pending ? "Saving…" : "Save"}</Button>
        </div>
      )}
    </div>
  );
}
