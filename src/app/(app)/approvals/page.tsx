import Link from "next/link";
import { listPendingForUser, listAllPending, listApproved, listRejected } from "@/server/queries/approvals";
import { PageHead } from "@/components/master/page-head";
import { ApprovalsTable } from "@/components/approvals/approvals-table";

const TABS = [
  { id: "you",      label: "Pending you" },
  { id: "all",      label: "All pending" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
] as const;

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  const active = (TABS.find(t => t.id === sp.tab)?.id) ?? "you";

  const rows =
    active === "you"      ? await listPendingForUser() :
    active === "all"      ? await listAllPending() :
    active === "approved" ? await listApproved() :
                            await listRejected();

  return (
    <>
      <PageHead title="Approvals" subtitle="BOMs awaiting your sign-off." />
      <div className="mb-4 flex gap-1 border-b border-[var(--color-line)]">
        {TABS.map(t => (
          <Link key={t.id} href={`/approvals?tab=${t.id}`}
                className={`-mb-px border-b-2 px-3.5 py-2 text-[13px] font-medium ${
                  active === t.id
                    ? "border-[var(--color-accent)] text-[var(--color-text)]"
                    : "border-transparent text-[var(--color-text-3)] hover:text-[var(--color-text-2)]"
                }`}>
            {t.label}
          </Link>
        ))}
      </div>
      <ApprovalsTable rows={rows as any} actionable={active === "you" || active === "all"} />
    </>
  );
}
