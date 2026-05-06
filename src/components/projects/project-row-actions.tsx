"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";
import { softDeleteProject } from "@/server/actions/projects";

export function ProjectRowActions({ id, code }: { id: string; code: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center justify-end gap-1.5">
      <Link href={`/projects/${id}`}>
        <Button variant="ghost" size="sm">Edit</Button>
      </Link>
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => {
          if (!confirm(`Archive project ${code}? It will be hidden from lists but kept in history.`)) return;
          start(async () => {
            try {
              await softDeleteProject({ id });
              toast.success(`${code} archived`);
              router.refresh();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Archive failed");
            }
          });
        }}
      >
        <Icon.Trash size={14} />
      </Button>
    </div>
  );
}
