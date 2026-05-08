import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PageHead } from "@/components/master/page-head";
import { ProcurementSettingsForm } from "@/components/settings/procurement-settings-form";
import { getProcurementSettings } from "@/server/queries/system-settings";

export default async function ProcurementSettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/sign-in");
  const role = (session.user as { role?: "owner" | "admin" | "member" }).role ?? "member";
  if (role !== "owner" && role !== "admin") redirect("/settings");

  const initial = await getProcurementSettings();

  return (
    <>
      <PageHead
        title="Procurement email"
        subtitle="Recipients and template used when a BOM is sent to procurement."
      />
      <ProcurementSettingsForm initial={initial} />
    </>
  );
}
