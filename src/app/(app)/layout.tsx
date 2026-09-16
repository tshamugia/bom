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
    <div className="app">
      <Sidebar user={{ name: session.user.name, email: session.user.email, role }} />
      <div className="main">
        <Topbar />
        <div className="content">{children}</div>
      </div>
      <Toaster />
    </div>
  );
}
