"use client";

import { toast } from "@/lib/toast";
import { Icon } from "@/components/icons";

/** File-server path of a drawing, with a button to copy it for pasting into Explorer. */
export function FileLocation({ path }: { path: string }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(path);
      toast.success("File location copied");
    } catch {
      toast.error("Couldn't copy — select the path and copy it by hand.");
    }
  };

  return (
    <span className="inline-flex max-w-full items-center gap-1.5">
      <Icon.Folder className="ico shrink-0 text-[var(--color-text-3)]" aria-hidden />
      <span className="mono select-all" style={{ overflowWrap: "anywhere" }}>{path}</span>
      <button type="button" className="btn btn-icon btn-ghost shrink-0" onClick={copy} aria-label="Copy file location">
        <Icon.Copy className="ico" />
      </button>
    </span>
  );
}
