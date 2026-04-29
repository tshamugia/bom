// Dashboard view — projects, stats, recent activity
function Dashboard({ openProject, setRoute }) {
  const I = window.Icon;

  const statusBadge = (s) => {
    const m = {
      "in-progress": ["b-blue", "In progress"],
      "review":      ["b-amber", "In review"],
      "approved":    ["b-green", "Approved"],
      "draft":       ["b-gray", "Draft"],
    };
    const [cls, label] = m[s] || ["b-gray", s];
    return <span className={"badge " + cls}><span className="dot"/>{label}</span>;
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-sub">Active BOMs, recent activity, and procurement health.</p>
        </div>
        <div className="split">
          <button className="btn"><I.Download/> Export report</button>
          <button className="btn btn-primary" onClick={() => setRoute("builder")}><I.Plus/> New BOM</button>
        </div>
      </div>

      <div className="stat-grid">
        <div className="stat">
          <div className="stat-label">Active BOMs</div>
          <div className="stat-value">14 <span className="stat-delta">+3</span></div>
        </div>
        <div className="stat">
          <div className="stat-label">Open value</div>
          <div className="stat-value">$28,430 <span className="stat-delta">+8.4%</span></div>
        </div>
        <div className="stat">
          <div className="stat-label">Avg. lead time</div>
          <div className="stat-value">5.8d <span className="stat-delta down">+0.4d</span></div>
        </div>
        <div className="stat">
          <div className="stat-label">Approvals pending</div>
          <div className="stat-value">3 <span className="stat-delta down">2 overdue</span></div>
        </div>
      </div>

      <div style={{display:"grid", gridTemplateColumns:"1fr 320px", gap:16}}>
        <div className="card">
          <div className="card-head">
            <h3 className="card-title">Projects</h3>
            <span className="muted" style={{fontSize:12}}>6 active</span>
            <div className="spacer"/>
            <div className="pill">All teams <I.ChevDown/></div>
            <div className="pill">All status <I.ChevDown/></div>
          </div>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr>
                <th>Project</th>
                <th>Owner</th>
                <th className="num">Lines</th>
                <th className="num">Total</th>
                <th>Status</th>
                <th>Updated</th>
                <th>Target</th>
                <th></th>
              </tr></thead>
              <tbody>
                {window.PROJECTS.map(p => (
                  <tr key={p.id} style={{cursor:"pointer"}} onClick={() => openProject(p)}>
                    <td>
                      <div style={{display:"flex", alignItems:"center", gap:10}}>
                        <I.Folder/>
                        <div>
                          <div style={{fontWeight:500}}>{p.name}</div>
                          <div className="mono" style={{fontSize:11, color:"var(--text-3)"}}>{p.code}</div>
                        </div>
                      </div>
                    </td>
                    <td>{p.owner}</td>
                    <td className="num tabular">{p.lines}</td>
                    <td className="num tabular">${p.total.toLocaleString()}</td>
                    <td>{statusBadge(p.status)}</td>
                    <td className="muted">{p.updated}</td>
                    <td className="muted">{p.target}</td>
                    <td><button className="btn btn-icon btn-ghost"><I.Chevron/></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div style={{display:"flex", flexDirection:"column", gap:12}}>
          <div className="card">
            <div className="card-head"><h3 className="card-title">Recent activity</h3></div>
            <div style={{padding:"12px 16px"}}>
              <div className="timeline">
                <div className="tl-item done"><div className="tl-dot"/>
                  <div className="tl-title">NB-2412 approved by S. Chen</div>
                  <div className="tl-meta">2 hours ago</div>
                </div>
                <div className="tl-item active"><div className="tl-dot"/>
                  <div className="tl-title">GW-2411 sent for review</div>
                  <div className="tl-meta">Yesterday · S. Patel</div>
                </div>
                <div className="tl-item"><div className="tl-dot"/>
                  <div className="tl-title">Vendor TaiwanTech rate updated</div>
                  <div className="tl-meta">2 days ago</div>
                </div>
                <div className="tl-item"><div className="tl-dot"/>
                  <div className="tl-title">12 new SKUs added to catalog</div>
                  <div className="tl-meta">3 days ago · A. Rivera</div>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h3 className="card-title">Stock alerts</h3></div>
            <div style={{padding:"4px 0"}}>
              <div style={{padding:"10px 16px", display:"flex", alignItems:"center", gap:10, fontSize:12.5, borderBottom:"1px solid var(--line-soft)"}}>
                <span className="badge b-red"><span className="dot"/>Backorder</span>
                <span className="mono" style={{fontSize:11.5}}>FER-BLM18-600</span>
                <span className="muted spacer" style={{textAlign:"right"}}>0 pcs</span>
              </div>
              <div style={{padding:"10px 16px", display:"flex", alignItems:"center", gap:10, fontSize:12.5, borderBottom:"1px solid var(--line-soft)"}}>
                <span className="badge b-amber"><span className="dot"/>Low stock</span>
                <span className="mono" style={{fontSize:11.5}}>CON-HDR-2X20</span>
                <span className="muted spacer" style={{textAlign:"right"}}>184 pcs</span>
              </div>
              <div style={{padding:"10px 16px", display:"flex", alignItems:"center", gap:10, fontSize:12.5}}>
                <span className="badge b-amber"><span className="dot"/>Low stock</span>
                <span className="mono" style={{fontSize:11.5}}>ENC-ABS-100X68</span>
                <span className="muted spacer" style={{textAlign:"right"}}>88 pcs</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
window.Dashboard = Dashboard;
