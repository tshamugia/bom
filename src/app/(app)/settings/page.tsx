import Link from "next/link";
import { PageHead } from "@/components/master/page-head";
import { Icon } from "@/components/icons";

export default function SettingsPage() {
  return (
    <>
      <PageHead
        title="Settings"
        subtitle="Workspace preferences and account."
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/settings/profile"
          className="flex items-start gap-3 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)] transition-colors hover:bg-[var(--color-surface-2)]"
        >
          <div
            className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg text-white"
            style={{
              background:
                "linear-gradient(135deg, var(--color-cat-indigo) 0%, var(--color-cat-violet) 100%)",
            }}
          >
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
      </div>
    </>
  );
}
