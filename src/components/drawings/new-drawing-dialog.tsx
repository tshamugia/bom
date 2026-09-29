"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Icon } from "@/components/icons";
import { createDrawing } from "@/server/actions/drawings";
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
    code: "",
    name: "",
    disciplineId: "",
    ownerId: users.some(u => u.id === currentUserId) ? currentUserId : "",
    dueDate: "",
    estimatedHours: "",
  });
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<DrawingFormValue>(blank);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  const submit = () => {
    start(async () => {
      const res = await createDrawing({
        projectId: value.projectId,
        code: value.code.trim(),
        name: value.name.trim(),
        disciplineId: value.disciplineId,
        ownerId: value.ownerId,
        dueDate: value.dueDate || null,
        estimatedHours: parseHours(value.estimatedHours) ?? null,
        commitMessage: note.trim() || undefined,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${value.code.trim()} created`);
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
