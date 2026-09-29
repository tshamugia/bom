import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth-context";
import { listUsers } from "@/server/actions/users";
import { PageHead } from "@/components/master/page-head";
import { isAdmin } from "@/lib/roles";
import { UsersClient } from "./users-client";

export default async function UsersPage() {
  const session = await requireSession();
  if (!isAdmin(session.user)) redirect("/dashboard");

  const users = await listUsers();

  return (
    <>
      <PageHead
        title="Users"
        subtitle="Create users, set their role, reset passwords and disable access."
      />
      <UsersClient
        callerId={session.user.id}
        users={users.map(u => ({
          ...u,
          createdAt: u.createdAt.toISOString(),
        }))}
      />
    </>
  );
}
