import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ShellChrome } from "@/components/shell/shell-chrome";
import { Toaster } from "@/components/ui/sonner";
import { roleOf } from "@/lib/roles";
import { countPendingReceipts } from "@/server/queries/status-overview";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/sign-in");

  const role = roleOf(session.user);
  // Viewers confirm drawing receipts from their overview; the nav shows how many wait.
  const pendingReceipts = role === "viewer" ? await countPendingReceipts() : 0;

  return (
    <>
      <ShellChrome user={{ name: session.user.name, email: session.user.email, role }} pendingReceipts={pendingReceipts}>
        {children}
      </ShellChrome>
      {/* On phones, toasts sit above the bottom tab bar. */}
      <Toaster mobileOffset={{ bottom: "calc(72px + env(safe-area-inset-bottom))" }} />
    </>
  );
}
