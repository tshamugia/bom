import { listAllSent } from "@/server/queries/approvals";
import { PageHead } from "@/components/master/page-head";
import { ApprovalsTable } from "@/components/approvals/approvals-table";

export default async function SentBomsPage() {
  const rows = await listAllSent();

  return (
    <>
      <PageHead title="Sent BOMs" subtitle="All BOMs sent to procurement." />
      <ApprovalsTable rows={rows as any} />
    </>
  );
}
