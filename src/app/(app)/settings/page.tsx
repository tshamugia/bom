import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { PageHead } from "@/components/master/page-head";
import { Icon } from "@/components/icons";

export default async function SettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/sign-in");
  const role = (session.user as { role?: "owner" | "admin" | "member" }).role ?? "member";
  const isAdmin = role === "owner" || role === "admin";

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

        {isAdmin && (
          <Link
            href="/settings/procurement"
            className="flex items-start gap-3 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-card)] transition-colors hover:bg-[var(--color-surface-2)]"
          >
            <div
              className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg text-white"
              style={{
                background:
                  "linear-gradient(135deg, var(--color-cat-teal, #0ea5a4) 0%, var(--color-cat-indigo) 100%)",
              }}
            >
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
    </>
  );
}
