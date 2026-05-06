import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth-context";
import { listUsers } from "@/server/actions/users";
import { PageHead } from "@/components/master/page-head";
import { UsersClient } from "./users-client";

export default async function UsersPage() {
  const session = await requireSession();
  const role = (session.user as { role?: "owner" | "admin" | "member" }).role ?? "member";
  if (role !== "owner" && role !== "admin") redirect("/dashboard");

  const users = await listUsers();

  return (
    <>
      <PageHead
        title="Users"
        subtitle="Create and manage workspace users."
      />
      <UsersClient
        callerRole={role}
        callerId={session.user.id}
        users={users.map(u => ({
          ...u,
          createdAt: u.createdAt.toISOString(),
        }))}
      />
    </>
  );
}
