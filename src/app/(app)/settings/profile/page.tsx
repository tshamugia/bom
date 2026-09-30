import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageHead } from "@/components/master/page-head";
import { Badge } from "@/components/ui/badge";
import { roleOf } from "@/lib/roles";
import { ChangePasswordForm } from "@/components/settings/change-password-form";

export default async function ProfilePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/sign-in");

  const role = roleOf(session.user);
  const initials = session.user.name
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const mustChange = !!session.user.mustChangePassword;

  return (
    <>
      <PageHead title="Profile" subtitle="Your account information and password." />

      {mustChange && (
        <div
          role="alert"
          className="mb-5 max-w-xl rounded-lg border border-[var(--color-warning)]/30 bg-[var(--color-warning-soft)] px-4 py-3 text-[13px] text-[var(--color-text)]"
        >
          <strong className="font-semibold">Set your own password to continue.</strong> The one you signed in with was set by an admin and is temporary.
        </div>
      )}

      <div className="max-w-xl rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-card)] max-[701px]:p-4">
        <div className="flex items-center gap-4 border-b border-[var(--color-line-soft)] pb-4">
          <div
            className="grid h-14 w-14 shrink-0 place-items-center rounded-full text-[18px] font-semibold text-white"
            style={{
              background:
                "linear-gradient(135deg, var(--color-cat-indigo) 0%, var(--color-cat-violet) 100%)",
            }}
          >
            {initials}
          </div>
          <div className="min-w-0">
            <div className="text-[16px] font-semibold tracking-tight text-[var(--color-text)]">
              {session.user.name}
            </div>
            <div className="text-[13px] text-[var(--color-text-3)] [overflow-wrap:anywhere]">
              {session.user.email}
            </div>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-[120px_minmax(0,1fr)] gap-y-3 text-[13px] max-[480px]:grid-cols-[84px_minmax(0,1fr)]">
          <dt className="text-[var(--color-text-3)]">Role</dt>
          <dd>
            <Badge tone={role === "admin" ? "info" : "gray"}>
              <span className="capitalize">{role}</span>
            </Badge>
          </dd>
          <dt className="text-[var(--color-text-3)]">Email</dt>
          <dd className="text-[var(--color-text)] [overflow-wrap:anywhere]">{session.user.email}</dd>
          <dt className="text-[var(--color-text-3)]">Name</dt>
          <dd className="text-[var(--color-text)]">{session.user.name}</dd>
        </dl>
      </div>

      <div className="mt-5 max-w-xl rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-card)] max-[701px]:p-4">
        <h2 className="text-[14px] font-semibold tracking-tight">Password</h2>
        <p className="mt-0.5 mb-4 text-[12.5px] text-[var(--color-text-3)]">
          Changing it signs you out on your other devices.
        </p>
        <ChangePasswordForm required={mustChange} />
      </div>
    </>
  );
}
