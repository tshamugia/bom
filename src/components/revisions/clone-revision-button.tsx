"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { branchRevision } from "@/server/actions/revisions";

export function CloneRevisionButton({
  revisionId, letter, projectId, hasOpenDraft,
}: { revisionId: string; letter: string; projectId: string; hasOpenDraft: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending || hasOpenDraft}
      title={hasOpenDraft ? "A draft already exists for this project" : `Clone Rev ${letter} into a new draft`}
      onClick={() => start(async () => {
        try {
          const newId = await branchRevision({ parentRevisionId: revisionId });
          toast.success(`Cloned Rev ${letter} into a new draft`);
          router.push(`/builder/${projectId}?revision=${newId}`);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Clone failed");
        }
      })}
    >
      {pending ? "Cloning…" : "Clone"}
    </Button>
  );
}
