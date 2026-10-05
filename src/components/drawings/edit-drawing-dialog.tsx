"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";
import { suggestDrawingCode, updateDrawing } from "@/server/actions/drawings";
import { useSuggestedCode } from "@/components/master/code-field";
import {
  DrawingFormFields, isDrawingFormComplete, parseHours,
  type DisciplineOption, type DrawingFormValue, type ProjectOption, type UserOption,
} from "./drawing-form-fields";

export function EditDrawingDialog({
  drawingId,
  code,
  initial,
  projects,
  disciplines,
  users,
}: {
  drawingId: string;
  code: string;
  initial: DrawingFormValue;
  projects: ProjectOption[];
  disciplines: DisciplineOption[];
  users: UserOption[];
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<DrawingFormValue>(initial);
  const [pending, start] = useTransition();
  const router = useRouter();
  // The code only changes when the drawing moves to a project that already uses it.
  const moved = value.projectId !== initial.projectId;
  const suggested = useSuggestedCode(
    suggestDrawingCode,
    open && moved && value.name.trim() ? { projectId: value.projectId, name: value.name.trim(), drawingId } : null,
  );

  const submit = () => {
    start(async () => {
      const res = await updateDrawing({
        id: drawingId,
        projectId: value.projectId,
        name: value.name.trim(),
        disciplineId: value.disciplineId,
        ownerId: value.ownerId,
        dueDate: value.dueDate || null,
        estimatedHours: parseHours(value.estimatedHours) ?? null,
        fileLocation: value.fileLocation.trim() || null,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Drawing saved");
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        setOpen(next);
        if (next) setValue(initial);
      }}
    >
      <DialogTrigger
        render={
          <button type="button" className="btn">
            <Icon.Edit className="ico" /> Edit
          </button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit drawing</DialogTitle>
          <DialogDescription>Changes are recorded in the drawing history. Moving it to another project keeps all revisions.</DialogDescription>
        </DialogHeader>

        <DrawingFormFields
          idPrefix="edit-drawing"
          value={value}
          code={{
            value: moved ? suggested.code : code,
            loading: moved && suggested.loading,
            note: moved
              ? "Moving keeps the code unless the new project already uses it — then it gets the next free one."
              : "The code is fixed — renaming the drawing keeps it.",
          }}
          onChange={setValue}
          projects={projects}
          disciplines={disciplines}
          users={users}
        />

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
          <Button onClick={submit} disabled={pending || !isDrawingFormComplete(value)}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
