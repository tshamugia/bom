import type { Metadata } from "next";
import { PageHead } from "@/components/master/page-head";
import { HelpTip } from "@/components/help/help-tip";
import { MyWorkView } from "@/components/my-work/my-work-view";
import { formatDate } from "@/lib/format";
import { getMyWork } from "@/server/queries/my-work";

export const metadata: Metadata = { title: "My work — Revline" };

export default async function MyWorkPage() {
  const work = await getMyWork();
  return (
    <>
      <PageHead
        title={<span className="inline-flex items-center gap-1.5">My work <HelpTip topic="my-work" /></span>}
        subtitle={`What needs you, your deadlines and what others changed on your work · as of ${formatDate(work.today)}`}
      />
      <MyWorkView work={work} />
    </>
  );
}
