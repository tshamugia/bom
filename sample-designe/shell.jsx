// Shell: sidebar + topbar
const { useState, useMemo, useEffect, useRef } = React;

function Sidebar({ route, setRoute }) {
  const I = window.Icon;
  const nav = [
    { group: "Workspace", items: [
      { id: "dashboard", label: "Dashboard", icon: <I.Home/>, badge: null },
      { id: "builder",   label: "BOM Builder", icon: <I.List/>, badge: "47" },
      { id: "preview",   label: "Preview & Generate", icon: <I.Doc/> },
      { id: "history",   label: "History", icon: <I.History/> },
    ]},
    { group: "Master Data", items: [
      { id: "catalog",   label: "Item Catalog", icon: <I.Box/>, badge: "1.4k" },
      { id: "vendors",   label: "Vendors", icon: <I.Truck/>, badge: "8" },
    ]},
    { group: "Process", items: [
      { id: "approval",  label: "Approvals", icon: <I.CheckCircle/>, badge: "3" },
    ]},
  ];

  return (
    <aside className="sidebar">
      <div className="sb-brand">
        <div className="sb-logo">B</div>
        <div>
          <div className="sb-name">BOM Studio</div>
          <div className="sb-name-sub">Halcyon Robotics</div>
        </div>
      </div>

      {nav.map(g => (
        <div className="sb-section" key={g.group}>
          <div className="sb-section-label">{g.group}</div>
          {g.items.map(it => (
            <div
              key={it.id}
              className={"sb-item " + (route === it.id ? "active" : "")}
              onClick={() => setRoute(it.id)}
            >
              {it.icon}
              <span>{it.label}</span>
              {it.badge && <span className="badge">{it.badge}</span>}
            </div>
          ))}
        </div>
      ))}

      <div className="sb-foot">
        <div className="avatar">MC</div>
        <div style={{flex:1, minWidth:0}}>
          <div className="who">Marcus Chen</div>
          <div className="who-sub">Lead Engineer</div>
        </div>
        <button className="btn btn-icon btn-ghost" title="Settings"><I.Settings/></button>
      </div>
    </aside>
  );
}

function Topbar({ route, project }) {
  const I = window.Icon;
  const labels = {
    dashboard: ["Workspace", "Dashboard"],
    builder:   ["Workspace", project ? `BOM ${project.code} · ${project.name}` : "BOM Builder"],
    preview:   ["Workspace", "Preview & Generate"],
    history:   ["Workspace", "History"],
    catalog:   ["Master Data", "Item Catalog"],
    vendors:   ["Master Data", "Vendors"],
    approval:  ["Process", "Approvals"],
  }[route] || ["", ""];

  return (
    <header className="topbar">
      <div className="crumbs">
        <span>{labels[0]}</span>
        <span className="sep">/</span>
        <span className="here">{labels[1]}</span>
      </div>
      <div className="tb-actions">
        <div className="tb-search">
          <svg className="ico" {...{width:14,height:14,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:1.8}}><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <input placeholder="Search SKUs, projects, vendors…" />
          <span className="kbd">⌘K</span>
        </div>
        <button className="btn btn-icon btn-ghost" title="Notifications"><I.Bell/></button>
        <button className="btn btn-ghost btn-sm"><I.Spark/> What's new</button>
      </div>
    </header>
  );
}

window.Sidebar = Sidebar;
window.Topbar = Topbar;
