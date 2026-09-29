import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ShellChrome } from "@/components/shell/shell-chrome";
import { Toaster } from "@/components/ui/sonner";
import { roleOf } from "@/lib/roles";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/sign-in");

  const role = roleOf(session.user);

  return (
    <>
      <ShellChrome user={{ name: session.user.name, email: session.user.email, role }}>
        {children}
      </ShellChrome>
      {/* On phones, toasts sit above the bottom tab bar. */}
      <Toaster mobileOffset={{ bottom: "calc(72px + env(safe-area-inset-bottom))" }} />
    </>
  );
}
