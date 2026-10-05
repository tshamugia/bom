"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Icon } from "@/components/icons";
import { createBom } from "@/server/actions/boms";
import { commitBomImport } from "@/server/actions/bom-import";
import { bomImportFailureMessage } from "@/lib/schemas/bom-import";
import { BomImportFilePicker, useBomImportFile } from "./bom-import-file";

export type NewBomProject = { id: string; code: string; name: string };

export function NewBomDialog({
  projectId,
  projects,
  open: openProp,
  onOpenChange,
}: {
  projectId?: string;
  projects?: NewBomProject[];
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
}) {
  const isControlled = openProp !== undefined;
  const [openState, setOpenState] = useState(false);
  const open = isControlled ? !!openProp : openState;
  const setOpen = (next: boolean) => {
    if (!isControlled) setOpenState(next);
    onOpenChange?.(next);
  };
  const [name, setName] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [source, setSource] = useState<"empty" | "file">("empty");
  const [pending, start] = useTransition();
  const router = useRouter();
  const importFile = useBomImportFile();

  const showProjectPicker = !projectId && Array.isArray(projects);
  const effectiveProjectId = projectId ?? selectedProjectId;

  function reset() { setName(""); setSelectedProjectId(""); setSource("empty"); importFile.reset(); }

  function pickFile(file: File | null) {
    // Name the BOM after the file unless a name is already typed.
    if (file && !name.trim()) setName(file.name.replace(/\.xlsx$/i, "").slice(0, 200));
    importFile.pick(file);
  }

  const submit = () => {
    if (!effectiveProjectId) return;
    const targetProjectId = effectiveProjectId;
    start(async () => {
      try {
        let bomId: string;
        if (source === "file") {
          if (!importFile.file) return;
          const fd = new FormData();
          fd.set("file", importFile.file);
          fd.set("mode", "new");
          fd.set("projectId", targetProjectId);
          fd.set("name", name.trim());
          const r = await commitBomImport(fd);
          if (!r.ok) {
            importFile.showFail(r);
            toast.error(bomImportFailureMessage(r));
            return;
          }
          bomId = r.bomId;
          toast.success(`BOM created with ${r.lines} line${r.lines === 1 ? "" : "s"}`
            + (r.itemsCreated > 0 ? ` · ${r.itemsCreated} new catalog item${r.itemsCreated === 1 ? "" : "s"}` : ""));
        } else {
          ({ bomId } = await createBom({ projectId: targetProjectId, name: name.trim() }));
          toast.success("BOM created");
        }
        setOpen(false);
        reset();
        router.push(`/builder/${targetProjectId}/${bomId}`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Create failed");
      }
    });
  };

  const blocked = !name.trim() || !effectiveProjectId || (source === "file" && !importFile.ready);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => { setOpen(next); if (!next) reset(); }}
    >
      {!isControlled && (
        <DialogTrigger
          render={
            <Button>
              <Icon.Plus size={14} className="mr-1.5" /> New BOM
            </Button>
          }
        />
      )}
      <DialogContent className={source === "file" ? "sm:max-w-lg" : undefined}>
        <DialogHeader>
          <DialogTitle>New BOM</DialogTitle>
          <DialogDescription>
            A draft Rev A is created automatically inside the BOM.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="tabs" role="tablist" aria-label="Start from">
            <button
              type="button"
              role="tab"
              aria-selected={source === "empty"}
              className={`tab ${source === "empty" ? "active" : ""}`}
              onClick={() => setSource("empty")}
            >
              Empty BOM
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={source === "file"}
              className={`tab ${source === "file" ? "active" : ""}`}
              onClick={() => setSource("file")}
            >
              <Icon.Sheet size={13} className="mr-1 inline align-[-2px]" /> From file
            </button>
          </div>
          {showProjectPicker && (
            <div className="grid gap-1.5">
              <Label htmlFor="new-bom-project">Project</Label>
              <select
                id="new-bom-project"
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="h-9 w-full min-w-0 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 text-[13px]"
              >
                <option value="">— Select project —</option>
                {projects!.map((p) => (
                  <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="new-bom-name">BOM name</Label>
            <Input
              id="new-bom-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              placeholder="e.g. Foundation, Electrical, Mechanical"
              autoFocus={source === "empty"}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !blocked && !pending) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
          </div>
          {source === "file" && <BomImportFilePicker state={importFile} inputId="new-bom-file" onPick={pickFile} />}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button onClick={submit} disabled={pending || blocked}>
            {pending ? "Creating…" : source === "file" ? "Create and import" : "Create BOM"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
