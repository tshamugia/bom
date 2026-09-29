"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Icon } from "@/components/icons";
import { acknowledgeTransmittal } from "@/server/actions/drawing-transmittals";

/** The recipient confirms they received an issued revision — the one change viewers can make. */
export function AcknowledgeButton({
  id,
  label = "Acknowledge",
  className = "btn btn-primary btn-sm",
}: {
  id: string;
  label?: string;
  className?: string;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      className={className}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await acknowledgeTransmittal({ id });
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          toast.success("Receipt acknowledged");
          router.refresh();
        })
      }
    >
      <Icon.Check className="ico" /> {pending ? "Saving…" : label}
    </button>
  );
}
