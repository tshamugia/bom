import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { Toaster } from "@/components/ui/sonner";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/sign-in");

  const role = (session.user as { role?: "owner" | "admin" | "member" }).role ?? "member";

  return (
    <div className="grid min-h-screen grid-cols-[224px_1fr] bg-[var(--color-bg)]">
      <Sidebar user={{ name: session.user.name, role }} />
      <div className="flex min-h-screen min-w-0 flex-col">
        <Topbar user={{ name: session.user.name, email: session.user.email, role }} />
        <div className="min-w-0 flex-1 p-6">{children}</div>
      </div>
      <Toaster />
    </div>
  );
}
