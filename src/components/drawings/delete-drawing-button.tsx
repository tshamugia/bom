"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { Icon } from "@/components/icons";
import { deleteDrawing } from "@/server/actions/drawings";

export function DeleteDrawingButton({ drawingId, code }: { drawingId: string; code: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <button
      type="button"
      className="btn btn-ghost"
      disabled={pending}
      onClick={() => {
        if (!confirm(`Delete drawing ${code}? It disappears from the register; its history stays in the activity log.`)) return;
        start(async () => {
          const res = await deleteDrawing({ id: drawingId });
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          toast.success(`${code} deleted`);
          router.push("/drawings");
        });
      }}
    >
      <Icon.Trash className="ico" /> {pending ? "Deleting…" : "Delete"}
    </button>
  );
}
