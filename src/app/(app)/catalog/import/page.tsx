import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PageHead } from "@/components/master/page-head";
import { UploadZone } from "@/components/import/upload-zone";
import { PreviewLoader } from "./preview-loader";
import { getDryRun } from "@/server/queries/import";
import { canEdit } from "@/lib/roles";
import { requireSession } from "@/server/auth-context";

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const sp = await searchParams;
  if (!canEdit((await requireSession()).user)) redirect("/catalog");
  const head = (
    <PageHead
      title="Import catalog"
      subtitle="Upload an XLSX following the template. Review the dry-run before committing."
      actions={<Link href="/catalog"><Button variant="outline">Back to catalog</Button></Link>}
    />
  );

  if (!sp.id) {
    return <>{head}<UploadZone /></>;
  }

  const dry = await getDryRun(sp.id);
  return (
    <>
      {head}
      <PreviewLoader importId={sp.id} initial={dry} />
    </>
  );
}
