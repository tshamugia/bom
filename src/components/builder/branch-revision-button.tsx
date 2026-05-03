"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { branchRevision } from "@/server/actions/revisions";

export function BranchRevisionButton({
  parentRevisionId, projectId, hasOpenDraft,
}: { parentRevisionId: string; projectId: string; hasOpenDraft: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      disabled={pending || hasOpenDraft}
      title={hasOpenDraft ? "A draft already exists for this project" : undefined}
      onClick={() => start(async () => {
        try {
          const newId = await branchRevision({ parentRevisionId });
          toast.success("New revision created");
          router.push(`/builder/${projectId}?revision=${newId}`);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Branch failed");
        }
      })}
    >
      New revision
    </Button>
  );
}
