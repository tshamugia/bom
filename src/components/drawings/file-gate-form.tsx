"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { DRAWING_FILE_GATES, DRAWING_FILE_GATE_LABEL, type DrawingFileGate } from "@/lib/drawing-files";
import { setDrawingFileGate } from "@/server/actions/drawing-settings";

export function FileGateForm({ initial }: { initial: DrawingFileGate }) {
  const [gate, setGate] = useState<DrawingFileGate>(initial);
  const [pending, start] = useTransition();
  const router = useRouter();

  const save = () =>
    start(async () => {
      const res = await setDrawingFileGate({ gate });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("PDF upload rule saved");
      router.refresh();
    });

  return (
    <div className="grid gap-3">
      <fieldset className="grid gap-1.5">
        <legend className="field-label mb-1.5">PDFs can be uploaded, sent and seen by viewers once the revision is</legend>
        {DRAWING_FILE_GATES.map(g => (
          <label
            key={g}
            className="flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-2 text-[12.5px]"
            style={{ borderColor: gate === g ? "var(--color-accent)" : "var(--color-line)" }}
          >
            <input type="radio" name="drawing-file-gate" className="mt-0.5" checked={gate === g} onChange={() => setGate(g)} />
            <span className="grid gap-0.5">
              <span className="font-medium">
                {DRAWING_FILE_GATE_LABEL[g].title}
                {g === "approved" && <span className="muted font-normal"> · default</span>}
              </span>
              <span className="muted">{DRAWING_FILE_GATE_LABEL[g].hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div>
        <Button onClick={save} disabled={pending || gate === initial}>{pending ? "Saving…" : "Save"}</Button>
      </div>
    </div>
  );
}
