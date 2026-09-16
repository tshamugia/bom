import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ShellChrome } from "@/components/shell/shell-chrome";
import { Toaster } from "@/components/ui/sonner";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/sign-in");

  const role = (session.user as { role?: "owner" | "admin" | "member" }).role ?? "member";

  return (
    <>
      <ShellChrome user={{ name: session.user.name, email: session.user.email, role }}>
        {children}
      </ShellChrome>
      <Toaster />
    </>
  );
}
