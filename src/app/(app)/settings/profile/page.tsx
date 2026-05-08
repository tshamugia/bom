import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageHead } from "@/components/master/page-head";
import { Badge } from "@/components/ui/badge";

export default async function ProfilePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/sign-in");

  const role = (session.user as { role?: "owner" | "admin" | "member" }).role ?? "member";
  const initials = session.user.name
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      <PageHead title="Profile" subtitle="Your account information." />

      <div className="max-w-xl rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-4 border-b border-[var(--color-line-soft)] pb-4">
          <div
            className="grid h-14 w-14 place-items-center rounded-full text-[18px] font-semibold text-white"
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
            <div className="text-[13px] text-[var(--color-text-3)]">
              {session.user.email}
            </div>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-[120px_1fr] gap-y-3 text-[13px]">
          <dt className="text-[var(--color-text-3)]">Role</dt>
          <dd>
            <Badge tone={role === "owner" ? "success" : role === "admin" ? "info" : "gray"}>
              {role}
            </Badge>
          </dd>
          <dt className="text-[var(--color-text-3)]">Email</dt>
          <dd className="text-[var(--color-text)]">{session.user.email}</dd>
          <dt className="text-[var(--color-text-3)]">Name</dt>
          <dd className="text-[var(--color-text)]">{session.user.name}</dd>
        </dl>
      </div>
    </>
  );
}
