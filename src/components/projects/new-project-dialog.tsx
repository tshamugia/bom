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
import { BlockedNote } from "@/components/help/blocked-note";
import { useDebouncedAction } from "@/components/master/code-field";
import { isProjectCode, projectCodeLetters, projectCodeYear } from "@/lib/codes";
import { checkProjectCode, createProject, type ProjectCodeCheck } from "@/server/actions/projects";

const NO_CHECK: ProjectCodeCheck | null = null;

export function NewProjectDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [year, setYear] = useState(() => projectCodeYear());
  // null = follow the name; a string once the creator types their own letters.
  const [letters, setLetters] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const trimmed = name.trim();
  const shownLetters = letters ?? (trimmed ? projectCodeLetters(trimmed) : "");
  const code = `${year}${shownLetters}`;
  const codeOk = isProjectCode(code);
  const check = useDebouncedAction(
    checkProjectCode,
    open && trimmed && codeOk ? { name: trimmed, year, letters: shownLetters } : null,
    NO_CHECK,
  );
  const answer = check.value?.code === code ? check.value : null;
  const taken = !!answer?.taken;
  const checking = codeOk && !answer;

  function reset() {
    setName("");
    setClient("");
    setYear(projectCodeYear());
    setLetters(null);
  }

  const submit = () => {
    start(async () => {
      try {
        const project = await createProject({
          name: trimmed,
          clientName: client.trim() || undefined,
          codeYear: year,
          codeLetters: shownLetters,
        });
        toast.success(`${project.code} created`);
        setOpen(false);
        reset();
        router.push(`/projects/${project.id}`);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Create failed");
      }
    });
  };

  const blocked = !trimmed || !codeOk || checking || taken;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger
        render={
          <button type="button" className="btn btn-primary">
            <Icon.Plus className="ico" /> New project
          </button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            Projects start empty. Fill in the passport and add BOMs and drawings from the project page.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="new-project-name">Project name</Label>
            <Input
              id="new-project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              placeholder="e.g. Tegeta Motors"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-[72px_96px_1fr] items-end gap-3 max-[480px]:grid-cols-[72px_96px]">
            <div className="grid gap-1.5">
              <Label htmlFor="new-project-year">Year</Label>
              <Input
                id="new-project-year"
                value={year}
                inputMode="numeric"
                maxLength={2}
                className="font-mono"
                aria-invalid={!/^\d{2}$/.test(year)}
                onChange={(e) => setYear(e.target.value.replace(/\D/g, "").slice(0, 2))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="new-project-letters">Letters</Label>
              <Input
                id="new-project-letters"
                value={shownLetters}
                maxLength={3}
                autoCapitalize="characters"
                className="font-mono"
                placeholder="ABC"
                aria-invalid={!!shownLetters && !/^[A-Z]{3}$/.test(shownLetters)}
                onChange={(e) => setLetters(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3))}
              />
            </div>
            <div className="pb-2 text-[13px] max-[480px]:col-span-2 max-[480px]:pb-0">
              <span className="muted">Code </span>
              <b className="font-mono">{codeOk ? code : "—"}</b>
              {codeOk && (
                <span className="muted">
                  {checking ? " · checking…" : taken ? " · taken" : " · free"}
                </span>
              )}
              {letters !== null && trimmed && letters !== projectCodeLetters(trimmed) && (
                <>
                  {" · "}
                  <button type="button" className="text-[var(--color-info)] hover:underline" onClick={() => setLetters(null)}>
                    use {projectCodeLetters(trimmed)}
                  </button>
                </>
              )}
            </div>
          </div>

          {taken ? (
            <BlockedNote icon="lock">
              {code} is already used by another project (archived ones count too).{" "}
              {answer?.alternative ? (
                <button
                  type="button"
                  className="text-[var(--color-info)] hover:underline"
                  onClick={() => {
                    setYear(answer.alternative!.slice(0, 2));
                    setLetters(answer.alternative!.slice(2));
                  }}
                >
                  Use {answer.alternative}
                </button>
              ) : (
                "Type other letters."
              )}
            </BlockedNote>
          ) : (
            <BlockedNote>
              Year and three letters from the name, as in drawing file names (INS-{codeOk ? code : "26TGT"}-ZZ-00-FA-102).
              Change them now if you need to — later only an admin can.
            </BlockedNote>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="new-project-client">Client (optional)</Label>
            <Input
              id="new-project-client"
              value={client}
              onChange={(e) => setClient(e.target.value)}
              maxLength={200}
              placeholder="e.g. Hilton Tbilisi"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !blocked && !pending) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending || blocked}>
            {pending ? "Creating…" : "Create project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
