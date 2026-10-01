import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { PageHead } from "@/components/master/page-head";
import { Icon } from "@/components/icons";
import { isAdmin } from "@/lib/roles";

export default async function SettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/sign-in");
  const admin = isAdmin(session.user);

  return (
    <div className="page-narrow">
      <PageHead
        title="Settings"
        subtitle="Workspace preferences and account."
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/settings/profile"
          className="flex items-start gap-3 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)] transition-colors hover:border-[var(--color-line-strong)] hover:bg-[var(--color-surface-2)]"
        >
          <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-[var(--r-2)] bg-[var(--accent-soft)] text-[var(--accent-text)]">
            <Icon.User size={16} />
          </div>
          <div className="min-w-0">
            <div className="text-[14px] font-semibold text-[var(--color-text)]">
              Profile
            </div>
            <div className="mt-0.5 text-[12.5px] text-[var(--color-text-3)]">
              Your account name, email, and role.
            </div>
          </div>
        </Link>

        {admin && (
          <Link
            href="/settings/drawings"
            className="flex items-start gap-3 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)] transition-colors hover:border-[var(--color-line-strong)] hover:bg-[var(--color-surface-2)]"
          >
            <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-[var(--r-2)] bg-[var(--accent-soft)] text-[var(--accent-text)]">
              <Icon.Drawing size={16} />
            </div>
            <div className="min-w-0">
              <div className="text-[14px] font-semibold text-[var(--color-text)]">
                Drawings
              </div>
              <div className="mt-0.5 text-[12.5px] text-[var(--color-text-3)]">
                Status email recipients and disciplines.
              </div>
            </div>
          </Link>
        )}

        {admin && (
          <Link
            href="/settings/procurement"
            className="flex items-start gap-3 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)] transition-colors hover:border-[var(--color-line-strong)] hover:bg-[var(--color-surface-2)]"
          >
            <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-[var(--r-2)] bg-[var(--accent-soft)] text-[var(--accent-text)]">
              <Icon.Mail size={16} />
            </div>
            <div className="min-w-0">
              <div className="text-[14px] font-semibold text-[var(--color-text)]">
                Procurement email
              </div>
              <div className="mt-0.5 text-[12.5px] text-[var(--color-text-3)]">
                Recipients for BOMs sent to procurement.
              </div>
            </div>
          </Link>
        )}
      </div>
    </div>
  );
}
