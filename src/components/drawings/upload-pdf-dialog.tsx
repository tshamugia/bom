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
import {
  FILE_TYPE_ERROR_MESSAGE, MAX_DRAWING_FILE_MB, checkFileType, drawingFileName, formatFileSize,
} from "@/lib/drawing-files";
import { formatDrawingRevision } from "@/lib/drawing-status";
import {
  cancelDrawingFileUpload, confirmDrawingFileUpload, requestDrawingFileUpload,
} from "@/server/actions/drawing-files";

/** Posts the file to the bucket form, reporting progress; resolves false on any failure. */
function postToBucket(
  url: string,
  fields: Record<string, string>,
  file: File,
  onProgress: (pct: number) => void,
): Promise<boolean> {
  return new Promise(resolve => {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    form.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.upload.onprogress = e => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
    xhr.onerror = () => resolve(false);
    xhr.onabort = () => resolve(false);
    xhr.send(form);
  });
}

export function UploadPdfDialog({
  revisionId,
  revisionNumber,
  drawingCode,
  statusLabel,
  replacing = false,
}: {
  revisionId: string;
  revisionNumber: number;
  drawingCode: string;
  statusLabel: string;
  /** The revision already has a PDF — the new one takes its place. */
  replacing?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const busy = progress !== null;
  const rev = formatDrawingRevision(revisionNumber);
  const check = file ? checkFileType(file) : null;

  const reset = () => {
    setFile(null);
    setProgress(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const upload = async () => {
    if (!file || !check?.ok) return;
    setProgress(0);
    try {
      const req = await requestDrawingFileUpload({
        revisionId,
        fileName: file.name,
        contentType: file.type,
        size: file.size,
      });
      if (!req.ok) {
        toast.error(req.error);
        return;
      }
      const sent = await postToBucket(req.url, req.fields, file, setProgress);
      if (!sent) {
        await cancelDrawingFileUpload({ fileId: req.fileId });
        toast.error("The upload didn't finish — check your connection and try again.");
        return;
      }
      const done = await confirmDrawingFileUpload({ fileId: req.fileId });
      if (!done.ok) {
        toast.error(done.error);
        return;
      }
      toast.success(`${drawingFileName(drawingCode, revisionNumber)} uploaded`);
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
          <button type="button" className={replacing ? "btn btn-sm" : "btn btn-primary"}>
            <Icon.Upload className="ico" /> {replacing ? "Replace PDF" : "Upload PDF"}
          </button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{replacing ? "Replace" : "Upload"} the PDF of {drawingCode} {rev}</DialogTitle>
          <DialogDescription>
            {rev} is {statusLabel}. The file is saved as <span className="mono whitespace-nowrap">{drawingFileName(drawingCode, revisionNumber)}</span>
            {replacing ? " and takes the place of the current PDF, which is kept in the archive." : "."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-1.5">
          <Label htmlFor="drawing-pdf-file">PDF file, up to {MAX_DRAWING_FILE_MB} MB</Label>
          <input
            ref={inputRef}
            id="drawing-pdf-file"
            type="file"
            accept="application/pdf,.pdf"
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
            <p className="text-[12px]" style={{ color: "var(--red)" }}>{FILE_TYPE_ERROR_MESSAGE[check.error]}</p>
          )}
        </div>

        {busy && (
          <div className="grid gap-1" aria-live="polite">
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
              <div className="h-full bg-[var(--color-accent)] transition-[width]" style={{ width: `${progress}%` }} />
            </div>
            <span className="muted text-[12px]">{progress! < 100 ? `Uploading… ${progress}%` : "Checking the file…"}</span>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          <Button onClick={upload} disabled={busy || !check?.ok}>
            {busy ? "Uploading…" : replacing ? "Replace PDF" : "Upload PDF"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
