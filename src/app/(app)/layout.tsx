import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ShellChrome } from "@/components/shell/shell-chrome";
import { Toaster } from "@/components/ui/sonner";
import { roleOf } from "@/lib/roles";
import { getMyWorkBellCount } from "@/server/queries/my-work";

/** The bell is a convenience — a failing count must not take every page down with it. */
async function bellCount(): Promise<number> {
  try {
    return await getMyWorkBellCount();
  } catch (e) {
    console.error("[my-work] bell count failed", e);
    return 0;
  }
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/sign-in");

  const role = roleOf(session.user);
  // What needs the user plus updates they haven't seen — shown on the bell and the My work nav item.
  const myWorkCount = await bellCount();

  return (
    <>
      <ShellChrome user={{ name: session.user.name, email: session.user.email, role }} myWorkCount={myWorkCount}>
        {children}
      </ShellChrome>
      {/* On phones, toasts sit above the bottom tab bar. */}
      <Toaster mobileOffset={{ bottom: "calc(72px + env(safe-area-inset-bottom))" }} />
    </>
  );
}
