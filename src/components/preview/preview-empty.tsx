import Link from "next/link";
import { Icon } from "@/components/icons";

type Kind = "no-projects" | "no-revision" | "not-found";

const COPY: Record<Kind, { title: string; body: string; href: string; cta: string }> = {
  "no-projects": {
    title: "No BOMs to preview yet",
    body: "Create a BOM in the Builder, then come back here to review and export it.",
    href: "/builder",
    cta: "Open BOM Builder",
  },
  "no-revision": {
    title: "This project has no active revision",
    body: "All revisions are locked. Open the project in the Builder to start a new revision.",
    href: "/builder",
    cta: "Open BOM Builder",
  },
  "not-found": {
    title: "Project not found",
    body: "It may have been deleted or you don't have access. Pick another from the list.",
    href: "/preview",
    cta: "Back to preview",
  },
};

export function PreviewEmpty({ kind }: { kind: Kind }) {
  const c = COPY[kind];
  return (
    <div className="grid place-items-center rounded-lg border border-dashed border-[var(--color-line)] bg-[var(--color-surface)] px-6 py-20 text-center">
      <div className="mb-3 grid h-11 w-11 place-items-center rounded-full bg-[var(--color-surface-2)] text-[var(--color-text-3)]">
        <Icon.Doc size={20} />
      </div>
      <h2 className="text-[15px] font-semibold">{c.title}</h2>
      <p className="mt-1 max-w-md text-[13px] text-[var(--color-text-3)]">{c.body}</p>
      <Link
        href={c.href}
        className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-2)] bg-[var(--color-accent)] px-3 text-[12.5px] font-medium text-white hover:bg-[var(--color-accent-hover)]"
      >
        {c.cta}
        <Icon.ArrowRight size={13} />
      </Link>
    </div>
  );
}
