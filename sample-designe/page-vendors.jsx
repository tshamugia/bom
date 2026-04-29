// Vendor management
function Vendors() {
  const I = window.Icon;

  const statusBadge = (s) => {
    const m = { preferred:["b-green","Preferred"], approved:["b-blue","Approved"], review:["b-amber","Under review"] }[s];
    return <span className={"badge " + m[0]}><span className="dot"/>{m[1]}</span>;
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Vendors</h1>
          <p className="page-sub">Approved suppliers, performance metrics, and lead times.</p>
        </div>
        <div className="split">
          <button className="btn"><I.Download/> Export</button>
          <button className="btn btn-primary"><I.Plus/> Add vendor</button>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat"><div className="stat-label">Total vendors</div><div className="stat-value">{window.VENDORS.length}</div></div>
        <div className="stat"><div className="stat-label">Preferred</div><div className="stat-value">{window.VENDORS.filter(v=>v.status==="preferred").length}</div></div>
        <div className="stat"><div className="stat-label">Avg. rating</div><div className="stat-value">4.6 <span className="stat-delta">↑ 0.2</span></div></div>
        <div className="stat"><div className="stat-label">Avg. lead time</div><div className="stat-value">6.4d</div></div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3 className="card-title">All vendors</h3>
          <div className="spacer"/>
          <button className="btn btn-sm"><I.Filter/> Filter</button>
        </div>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr>
              <th>Vendor</th><th>Code</th><th>Country</th><th>Lead time</th>
              <th className="num">SKUs</th><th className="num">Rating</th><th>Status</th><th></th>
            </tr></thead>
            <tbody>
              {window.VENDORS.map(v => (
                <tr key={v.id}>
                  <td>
                    <div style={{display:"flex", alignItems:"center", gap:10}}>
                      <div className="avatar" style={{width:28, height:28, fontSize:11, background:"linear-gradient(135deg, #6b7180, #4b5160)"}}>{v.code}</div>
                      <div style={{fontWeight:500}}>{v.name}</div>
                    </div>
                  </td>
                  <td className="mono" style={{fontSize:11.5}}>{v.code}</td>
                  <td>{v.country}</td>
                  <td className="tabular">{v.lead}</td>
                  <td className="num tabular">{v.items}</td>
                  <td className="num tabular">
                    <span style={{display:"inline-flex", alignItems:"center", gap:4}}>
                      <I.Star/> {v.rating.toFixed(1)}
                    </span>
                  </td>
                  <td>{statusBadge(v.status)}</td>
                  <td><button className="btn btn-icon btn-ghost"><I.More/></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
window.Vendors = Vendors;
