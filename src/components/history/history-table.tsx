import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";

type Row = {
  id: string;
  fileName: string;
  generatedAt: Date;
  generatedByName: string | null;
  byteSize: number;
  status: "exported" | "archived" | "failed";
  projectCode: string;
  projectName: string;
  revisionLetter: string;
};

export function HistoryTable({ rows }: { rows: Row[] }) {
  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="bg-[var(--color-surface-2)] text-[11px] uppercase tracking-wider text-[var(--color-text-3)]">
            <th className="px-4 py-2.5 text-left font-medium">BOM</th>
            <th className="px-4 py-2.5 text-left font-medium">Generated</th>
            <th className="px-4 py-2.5 text-left font-medium">By</th>
            <th className="px-4 py-2.5 text-left font-medium">File</th>
            <th className="px-4 py-2.5 text-right font-medium">Size</th>
            <th className="px-4 py-2.5 text-left font-medium">Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id} className="border-b border-[var(--color-line-soft)] last:border-0 hover:bg-[var(--color-surface-2)]">
              <td className="px-4 py-2.5">
                <div className="font-medium">{r.projectName}</div>
                <div className="font-mono text-[11px] text-[var(--color-text-3)]">{r.projectCode} · Rev. {r.revisionLetter}</div>
              </td>
              <td className="px-4 py-2.5 text-[var(--color-text-3)]">{new Date(r.generatedAt).toLocaleString()}</td>
              <td className="px-4 py-2.5">{r.generatedByName ?? "—"}</td>
              <td className="px-4 py-2.5 font-mono text-[11.5px]">{r.fileName}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{(r.byteSize / 1024).toFixed(1)} KB</td>
              <td className="px-4 py-2.5">
                {r.status === "exported" && <Badge tone="success">Exported</Badge>}
                {r.status === "archived" && <Badge tone="gray">Archived</Badge>}
                {r.status === "failed"   && <Badge tone="danger">Failed</Badge>}
              </td>
              <td className="px-4 py-2.5 text-right">
                <Link href={`/api/exports/${r.id}/download`} target="_blank">
                  <Button variant="ghost" size="sm" title="Re-download"><Icon.Download size={14} /></Button>
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
