"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { branchRevision } from "@/server/actions/revisions";

export function BranchRevisionButton({
  parentRevisionId, projectId, bomId, hasOpenDraft,
}: { parentRevisionId: string; projectId: string; bomId: string; hasOpenDraft: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      disabled={pending || hasOpenDraft}
      title={hasOpenDraft ? "A draft already exists for this BOM" : undefined}
      onClick={() => start(async () => {
        try {
          await branchRevision({ parentRevisionId });
          toast.success("New revision created");
          router.push(`/builder/${projectId}/${bomId}`);
          router.refresh();
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Branch failed");
        }
      })}
    >
      New revision
    </Button>
  );
}
