import { redirect } from "next/navigation";

/** Drawings reporting lives on the main dashboard; kept so older links and emails still land there. */
export default async function DrawingDashboardRedirect({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project } = await searchParams;
  redirect(project ? `/dashboard?project=${encodeURIComponent(project)}` : "/dashboard");
}
