"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Icon } from "@/components/icons";
import { DXF_FILE_ERROR_MESSAGE, MAX_DXF_MB, checkDxfFile } from "@/lib/drawing-checks";
import { formatFileSize } from "@/lib/drawing-files";
import {
  cancelDrawingCheckUpload, confirmDrawingCheckUpload, requestDrawingCheckUpload,
} from "@/server/actions/drawing-checks";
import { postToBucket } from "./upload-pdf-dialog";

export function UploadDxfDialog({
  revisionId,
  revisionLabel,
  drawingCode,
  again = false,
}: {
  revisionId: string;
  revisionLabel: string;
  drawingCode: string;
  /** The revision was checked before — the button reads "Check again". */
  again?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const busy = progress !== null;
  const check = file ? checkDxfFile(file) : null;

  const reset = () => {
    setFile(null);
    setProgress(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const upload = async () => {
    if (!file || !check?.ok) return;
    setProgress(0);
    try {
      const req = await requestDrawingCheckUpload({ revisionId, fileName: file.name, size: file.size });
      if (!req.ok) {
        toast.error(req.error);
        return;
      }
      const sent = await postToBucket(req.url, req.fields, file, setProgress);
      if (!sent) {
        await cancelDrawingCheckUpload({ runId: req.runId });
        toast.error("The upload didn't finish — check your connection and try again.");
        return;
      }
      const done = await confirmDrawingCheckUpload({ runId: req.runId });
      if (!done.ok) {
        toast.error(done.error);
        router.refresh();
        return;
      }
      toast.success("DXF uploaded — the check is running");
      setOpen(false);
      reset();
      router.refresh();
    } catch {
      toast.error("The upload failed — try again.");
    } finally {
      setProgress(null);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (busy) return;
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger
        render={
          <button type="button" className={again ? "btn btn-sm" : "btn btn-primary"}>
            <Icon.Upload className="ico" /> {again ? "Check again" : "Check a DXF"}
          </button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Check a DXF of {drawingCode} {revisionLabel}</DialogTitle>
          <DialogDescription>
            The file is checked against the naming and drafting standards. What it finds becomes remarks on this drawing,
            and remarks of rules that now pass close. The DXF is deleted once the check is over.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-1.5">
          <Label htmlFor="drawing-dxf-file">DXF file, up to {MAX_DXF_MB} MB</Label>
          <input
            ref={inputRef}
            id="drawing-dxf-file"
            type="file"
            accept=".dxf"
            disabled={busy}
            onChange={e => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-[13px] file:mr-3 file:rounded-md file:border file:border-[var(--color-line)] file:bg-[var(--color-surface-2)] file:px-3 file:py-1.5 file:text-[13px]"
          />
          {file && (
            <p className="muted text-[12px] [overflow-wrap:anywhere]">
              {file.name} · {formatFileSize(file.size)}
            </p>
          )}
          {check && !check.ok && (
            <p className="text-[12px]" style={{ color: "var(--red)" }}>{DXF_FILE_ERROR_MESSAGE[check.error]}</p>
          )}
          <p className="muted text-[12px]">Name the file by the standard before uploading, e.g. <span className="mono">INS-26TGT-ZZ-00-FA-102.dxf</span> — the name is checked too.</p>
        </div>

        {busy && (
          <div className="grid gap-1" aria-live="polite">
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
              <div className="h-full bg-[var(--color-accent)] transition-[width]" style={{ width: `${progress}%` }} />
            </div>
            <span className="muted text-[12px]">{progress! < 100 ? `Uploading… ${progress}%` : "Handing the file to the checker…"}</span>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          <Button onClick={upload} disabled={busy || !check?.ok}>{busy ? "Uploading…" : "Upload and check"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
