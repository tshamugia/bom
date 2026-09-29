import Link from "next/link";
import { requireSession } from "@/server/auth-context";
import { listBomSends, listIssuedTransmittals } from "@/server/queries/status-overview";
import { PageHead } from "@/components/master/page-head";
import { BomSendsTable, IssuedDrawingsTable } from "@/components/approvals/sent-tables";

/** Everything that went out: BOMs to procurement and drawing revisions issued to people. */
export default async function SentPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const [session, boms, issued] = await Promise.all([requireSession(), listBomSends(), listIssuedTransmittals()]);
  const showDrawings = tab === "drawings";

  return (
    <>
      <PageHead title="Sent" subtitle="BOMs sent to procurement and drawing revisions issued to people." />
      <nav className="tabs tabs-scroll" aria-label="Sent">
        <Link href="/approvals" className={`tab ${showDrawings ? "" : "active"}`} aria-current={showDrawings ? undefined : "page"}>
          BOMs to procurement <span className="muted">· {boms.length}</span>
        </Link>
        <Link href="/approvals?tab=drawings" className={`tab ${showDrawings ? "active" : ""}`} aria-current={showDrawings ? "page" : undefined}>
          Drawings issued <span className="muted">· {issued.length}</span>
        </Link>
      </nav>
      {showDrawings ? <IssuedDrawingsTable rows={issued} userId={session.user.id} /> : <BomSendsTable rows={boms} />}
    </>
  );
}
