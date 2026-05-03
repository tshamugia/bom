"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { discardDraft } from "@/server/actions/revisions";

export function DiscardDraftButton({ revisionId, projectId }: { revisionId: string; projectId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() => {
        if (!confirm("Discard the current draft? This cannot be undone.")) return;
        start(async () => {
          try {
            await discardDraft({ revisionId });
            toast.success("Draft discarded");
            router.push(`/projects/${projectId}/history`);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Discard failed");
          }
        });
      }}
    >
      Discard draft
    </Button>
  );
}
