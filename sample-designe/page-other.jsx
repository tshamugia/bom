// Approvals & History pages

function Approvals() {
  const I = window.Icon;
  const items = [
    { code:"GW-2411", name:"Gateway Hub Rev B", owner:"S. Patel", lines:82, total:5120.40, age:"4h", priority:"high" },
    { code:"NB-2412", name:"Northstar Beacon v3.2", owner:"M. Chen", lines:47, total:2840.50, age:"1d", priority:"med" },
    { code:"PWR-2410", name:"Power Module 24V/5A", owner:"M. Chen", lines:28, total:980.20, age:"2d", priority:"med" },
  ];
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Approvals</h1>
          <p className="page-sub">BOMs awaiting your sign-off as Engineering Lead.</p>
        </div>
      </div>
      <div className="tabs">
        <button className="tab active">Pending you <span className="muted">· 3</span></button>
        <button className="tab">All pending <span className="muted">· 8</span></button>
        <button className="tab">Approved <span className="muted">· 124</span></button>
        <button className="tab">Rejected <span className="muted">· 6</span></button>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>BOM</th><th>Owner</th><th className="num">Lines</th><th className="num">Total</th><th>Priority</th><th>Waiting</th><th>Stage</th><th></th></tr></thead>
            <tbody>
              {items.map(it => (
                <tr key={it.code}>
                  <td><div style={{fontWeight:500}}>{it.name}</div><div className="mono muted" style={{fontSize:11}}>{it.code}</div></td>
                  <td>{it.owner}</td>
                  <td className="num tabular">{it.lines}</td>
                  <td className="num tabular">${it.total.toLocaleString()}</td>
                  <td>{it.priority==="high" ? <span className="badge b-red"><span className="dot"/>High</span> : <span className="badge b-amber"><span className="dot"/>Medium</span>}</td>
                  <td className="muted">{it.age}</td>
                  <td><span className="badge b-blue"><span className="dot"/>Engineering review</span></td>
                  <td>
                    <div className="split">
                      <button className="btn btn-sm">Reject</button>
                      <button className="btn btn-sm btn-primary"><I.Check/> Approve</button>
                    </div>
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

function History() {
  const I = window.Icon;
  const statusBadge = (s) => {
    const m = { exported:["b-green","Exported"], archived:["b-gray","Archived"] }[s];
    return <span className={"badge " + m[0]}><span className="dot"/>{m[1]}</span>;
  };
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">History</h1>
          <p className="page-sub">All previously generated bills of materials. Restore, duplicate, or re-export.</p>
        </div>
        <div className="split">
          <button className="btn"><I.Filter/> Filter</button>
          <button className="btn"><I.Download/> Export log</button>
        </div>
      </div>
      <div className="card">
        <div className="card-head">
          <h3 className="card-title">Generated BOMs</h3>
          <div className="spacer"/>
          <span className="muted" style={{fontSize:12}}>Last 90 days</span>
        </div>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>BOM</th><th>Generated</th><th>By</th><th className="num">Lines</th><th className="num">Total</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {window.HISTORY.map(h => (
                <tr key={h.id}>
                  <td><div style={{fontWeight:500}}>{h.name}</div><div className="mono muted" style={{fontSize:11}}>{h.code}</div></td>
                  <td className="muted">{h.date}</td>
                  <td>{h.by}</td>
                  <td className="num tabular">{h.lines}</td>
                  <td className="num tabular">${h.total.toLocaleString()}</td>
                  <td>{statusBadge(h.status)}</td>
                  <td>
                    <div className="split">
                      <button className="btn btn-icon btn-ghost" title="Re-download"><I.Download/></button>
                      <button className="btn btn-icon btn-ghost" title="Duplicate"><I.Copy/></button>
                      <button className="btn btn-icon btn-ghost" title="More"><I.More/></button>
                    </div>
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

window.Approvals = Approvals;
window.History = History;
