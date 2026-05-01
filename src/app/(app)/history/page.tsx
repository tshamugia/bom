import { listExports } from "@/server/queries/exports";
import { PageHead } from "@/components/master/page-head";
import { HistoryTable } from "@/components/history/history-table";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";

export default async function HistoryPage() {
  const rows = await listExports();
  return (
    <>
      <PageHead
        title="History"
        subtitle="All previously generated bills of materials. Re-download or audit."
        actions={<Button variant="outline"><Icon.Filter size={14} className="mr-1.5" /> Filter</Button>}
      />
      <HistoryTable rows={rows as any} />
    </>
  );
}
