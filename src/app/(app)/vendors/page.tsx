import { listVendors, vendorStats } from "@/server/queries/vendors";
import { PageHead } from "@/components/master/page-head";
import { VendorStatusBadge } from "@/components/ui/badge";
import { VendorDialog } from "@/components/master/vendor-dialog";
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
            <a href="/api/exports/vendors.xlsx" className="btn"><Icon.Download className="ico" /> Export</a>
            <VendorDialog trigger={<button type="button" className="btn btn-primary"><Icon.Plus className="ico" /> Add vendor</button>} />
          </>
        }
      />

      <div className="stat-grid">
        <div className="stat"><div className="stat-label">Total vendors</div><div className="stat-value">{stats.total}</div></div>
        <div className="stat"><div className="stat-label">Preferred</div><div className="stat-value">{stats.preferred}</div></div>
        <div className="stat"><div className="stat-label">Avg. rating</div><div className="stat-value">{stats.avgRating.toFixed(1)}</div></div>
        <div className="stat"><div className="stat-label">Avg. lead time</div><div className="stat-value">{stats.avgLeadDays ? `${stats.avgLeadDays}d` : "—"}</div></div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3 className="card-title">All vendors</h3>
          <div className="spacer" />
          <button className="btn btn-sm"><Icon.Filter className="ico" /> Filter</button>
        </div>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Vendor</th><th>Code</th><th>Country</th><th>Lead time</th>
                <th className="num">SKUs</th><th className="num">Rating</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((v) => (
                <tr key={v.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div className="avatar" style={{ width: 28, height: 28, fontSize: 11, background: "linear-gradient(135deg, #6b7180, #4b5160)" }}>{v.code}</div>
                      <div style={{ fontWeight: 500 }}>{v.name}</div>
                    </div>
                  </td>
                  <td className="mono" style={{ fontSize: 11.5 }}>{v.code}</td>
                  <td>{v.country}</td>
                  <td className="tabular">{v.leadTime}</td>
                  <td className="num tabular">{v.itemsCount}</td>
                  <td className="num tabular">
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <Icon.Star className="ico" /> {Number(v.rating).toFixed(1)}
                    </span>
                  </td>
                  <td><VendorStatusBadge status={v.status} /></td>
                  <td>
                    <VendorDialog existing={v as React.ComponentProps<typeof VendorDialog>["existing"]} trigger={<button type="button" className="btn btn-icon btn-ghost"><Icon.More className="ico" /></button>} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
