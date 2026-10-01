"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { cameFrom } from "@/lib/nav-history";

export type BackTarget = { href: string; label: string };

/**
 * "← Projects" above a detail page's title. It always lands on the page it
 * names; when that is the page the user just came from, it goes back through
 * history instead, so the list keeps its filters and scroll position.
 */
export function BackLink({ href, label }: BackTarget) {
  const router = useRouter();
  const pathname = href.split(/[?#]/)[0];

  return (
    <Link
      href={href}
      className="page-back"
      aria-label={`Back to ${label}`}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        if (!cameFrom(pathname)) return;
        e.preventDefault();
        router.back();
      }}
    >
      <Icon.ArrowLeft className="ico" aria-hidden />
      <span>{label}</span>
    </Link>
  );
}
