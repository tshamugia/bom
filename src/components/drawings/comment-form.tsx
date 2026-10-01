"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { addDrawingComment } from "@/server/actions/drawings";
import { TEXTAREA_CLASS } from "./drawing-form-fields";

export function CommentForm({ revisionId, revisionLabel }: { revisionId: string; revisionLabel: string }) {
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  const submit = () => {
    start(async () => {
      const res = await addDrawingComment({ revisionId, body: body.trim() });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setBody("");
      router.refresh();
    });
  };

  return (
    <div className="grid gap-2">
      <textarea
        className={TEXTAREA_CLASS}
        value={body}
        onChange={e => setBody(e.target.value)}
        placeholder={`Comment on ${revisionLabel}…`}
        onKeyDown={e => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && body.trim() && !pending) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <div className="flex justify-end">
        <Button size="sm" variant="outline" disabled={pending || !body.trim()} onClick={submit}>
          {pending ? "Posting…" : "Comment"}
        </Button>
      </div>
    </div>
  );
}
