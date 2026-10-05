"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Icon } from "@/components/icons";
import { createDrawing, suggestDrawingCode } from "@/server/actions/drawings";
import { useSuggestedCode } from "@/components/master/code-field";
import {
  DrawingFormFields, isDrawingFormComplete, parseHours, TEXTAREA_CLASS,
  type DisciplineOption, type DrawingFormValue, type ProjectOption, type UserOption,
} from "./drawing-form-fields";

export function NewDrawingDialog({
  projects,
  disciplines,
  users,
  currentUserId,
  defaultProjectId,
}: {
  projects: ProjectOption[];
  disciplines: DisciplineOption[];
  users: UserOption[];
  currentUserId: string;
  defaultProjectId?: string;
}) {
  const blank = (): DrawingFormValue => ({
    projectId: defaultProjectId ?? "",
    name: "",
    disciplineId: "",
    ownerId: users.some(u => u.id === currentUserId) ? currentUserId : "",
    dueDate: "",
    estimatedHours: "",
    fileLocation: "",
  });
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<DrawingFormValue>(blank);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const suggested = useSuggestedCode(
    suggestDrawingCode,
    open && value.projectId && value.name.trim() ? { projectId: value.projectId, name: value.name.trim() } : null,
  );

  const submit = () => {
    start(async () => {
      const res = await createDrawing({
        projectId: value.projectId,
        name: value.name.trim(),
        disciplineId: value.disciplineId,
        ownerId: value.ownerId,
        dueDate: value.dueDate || null,
        estimatedHours: parseHours(value.estimatedHours) ?? null,
        fileLocation: value.fileLocation.trim() || null,
        commitMessage: note.trim() || undefined,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${res.code} created`);
      setOpen(false);
      router.push(`/drawings/${res.id}`);
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        setOpen(next);
        if (!next) {
          setValue(blank());
          setNote("");
        }
      }}
    >
      <DialogTrigger
        render={
          <button type="button" className="btn btn-primary">
            <Icon.Plus className="ico" /> New drawing
          </button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New drawing</DialogTitle>
          <DialogDescription>The drawing starts at rev1 with status In Progress.</DialogDescription>
        </DialogHeader>

        <DrawingFormFields
          idPrefix="new-drawing"
          value={value}
          code={{
            value: suggested.code,
            loading: suggested.loading,
            note: value.projectId
              ? "The code is made from the name — its initials and the next free number in the project."
              : "Pick the project first — the code is made from the name and numbered within the project.",
          }}
          onChange={setValue}
          projects={projects}
          disciplines={disciplines}
          users={users}
        />
        <div className="grid gap-1.5">
          <Label htmlFor="new-drawing-note">
            rev1 note <span className="text-[var(--color-text-3)]">(optional)</span>
          </Label>
          <textarea
            id="new-drawing-note"
            className={TEXTAREA_CLASS}
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Initial revision"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button onClick={submit} disabled={pending || !isDrawingFormComplete(value)}>
            {pending ? "Creating…" : "Create drawing"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
