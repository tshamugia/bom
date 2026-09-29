import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canEdit } from "@/lib/roles";

export default async function Root() {
  const session = await auth.api.getSession({ headers: await headers() });
  // Viewers come to check progress, so they start on the dashboard.
  redirect(session?.user && !canEdit(session.user) ? "/dashboard" : "/projects");
}
