import { listVendors, vendorStats } from "@/server/queries/vendors";
import { PageHead } from "@/components/master/page-head";
import { VendorStatusBadge } from "@/components/ui/badge";
import { VendorDialog } from "@/components/master/vendor-dialog";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";

export default async function VendorsPage() {
  const [list, stats] = await Promise.all([listVendors(), vendorStats()]);

  return (
    <>
      <PageHead
        title="Vendors"
        subtitle="Approved suppliers, performance metrics, and lead times."
        actions={
          <>
            <a href="/api/exports/vendors.xlsx">
              <Button variant="outline"><Icon.Download size={14} className="mr-1.5" /> Export</Button>
            </a>
            <VendorDialog trigger={<Button><Icon.Plus size={14} className="mr-1.5" /> Add vendor</Button>} />
          </>
        }
      />

      <div className="mb-5 grid grid-cols-4 gap-3">
        <Stat label="Total vendors" value={stats.total} />
        <Stat label="Preferred" value={stats.preferred} />
        <Stat label="Avg. rating" value={stats.avgRating.toFixed(1)} />
        <Stat label="Avg. lead time" value="6.4d" />
      </div>

      <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-2 border-b border-[var(--color-line-soft)] px-4 py-3">
          <h3 className="text-[13.5px] font-semibold">All vendors</h3>
        </div>
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="bg-[var(--color-surface-2)] text-[11px] uppercase tracking-wider text-[var(--color-text-3)]">
              <th className="px-4 py-2.5 text-left font-medium">Vendor</th>
              <th className="px-4 py-2.5 text-left font-medium">Code</th>
              <th className="px-4 py-2.5 text-left font-medium">Country</th>
              <th className="px-4 py-2.5 text-left font-medium">Lead time</th>
              <th className="px-4 py-2.5 text-right font-medium">Items</th>
              <th className="px-4 py-2.5 text-right font-medium">Rating</th>
              <th className="px-4 py-2.5 text-left font-medium">Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {list.map(v => (
              <tr key={v.id} className="border-b border-[var(--color-line-soft)] last:border-0 hover:bg-[var(--color-surface-2)]">
                <td className="px-4 py-2.5 font-medium">{v.name}</td>
                <td className="px-4 py-2.5 font-mono text-[11.5px]">{v.code}</td>
                <td className="px-4 py-2.5">{v.country}</td>
                <td className="px-4 py-2.5 tabular-nums">{v.leadTime}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{v.itemsCount}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">★ {Number(v.rating).toFixed(1)}</td>
                <td className="px-4 py-2.5"><VendorStatusBadge status={v.status} /></td>
                <td className="px-4 py-2.5 text-right">
                  <VendorDialog existing={v as any} trigger={<Button variant="ghost" size="sm"><Icon.Edit size={14} /></Button>} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
      <div className="mb-1.5 text-[11.5px] font-medium uppercase tracking-wider text-[var(--color-text-3)]">{label}</div>
      <div className="text-[22px] font-semibold tabular-nums tracking-tight">{value}</div>
    </div>
  );
}
