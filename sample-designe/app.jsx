// Main app — routing + state
function App() {
  const I = window.Icon;
  const [route, setRoute] = useState("dashboard");
  const [project, setProject] = useState(window.PROJECTS[0]);
  const [bomList, setBomList] = useState(window.INITIAL_BOM);
  const [showGenerate, setShowGenerate] = useState(false);
  const [toast, setToast] = useState(null);

  const tweakDefaults = /*EDITMODE-BEGIN*/{
    "layout": "split",
    "showSku": true,
    "showDesc": true,
    "showCat": true,
    "showVendor": true,
    "showUnit": true,
    "showQty": true,
    "showPrice": true,
    "showTotal": true,
    "showStock": true
  }/*EDITMODE-END*/;

  const [tweaks, setTweak] = window.useTweaks(tweakDefaults);

  const columns = {
    sku: tweaks.showSku, desc: tweaks.showDesc, cat: tweaks.showCat,
    vendor: tweaks.showVendor, unit: tweaks.showUnit, qty: tweaks.showQty,
    price: tweaks.showPrice, total: tweaks.showTotal, stock: tweaks.showStock,
  };
  const setColumns = (k, v) => setTweak("show" + k.charAt(0).toUpperCase() + k.slice(1), v);

  const openProject = (p) => { setProject(p); setRoute("builder"); };
  const gotoPreview = () => setRoute("preview");

  const generate = () => {
    setShowGenerate(true);
  };

  const downloadExcel = () => {
    // Mock CSV/Excel-ish download
    const itemBySku = Object.fromEntries(window.ITEMS.map(i => [i.sku, i]));
    const headers = ["#","SKU","Description","Category","Vendor","Manufacturer","Unit","Qty","Unit Price","Total","Stock"];
    const lines = [headers.join(",")];
    bomList.forEach((b, i) => {
      const it = itemBySku[b.sku];
      lines.push([
        i+1, it.sku, `"${it.desc}"`, it.sub, it.vendor, it.mfr, it.unit, b.qty,
        it.price.toFixed(3), (b.qty*it.price).toFixed(2), it.stock
      ].join(","));
    });
    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "application/vnd.ms-excel" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `BOM_${project?.code || "DRAFT"}_Rev_A.xls`;
    a.click();
    URL.revokeObjectURL(url);
    setShowGenerate(false);
    setToast("BOM exported to Excel — BOM_" + (project?.code || "DRAFT") + "_Rev_A.xls");
    setTimeout(() => setToast(null), 3500);
    setRoute("history");
  };

  let page;
  switch(route) {
    case "dashboard": page = <window.Dashboard openProject={openProject} setRoute={setRoute}/>; break;
    case "builder":   page = <window.BomBuilder project={project} bomList={bomList} setBomList={setBomList} columns={columns} setColumns={setColumns} layout={tweaks.layout} gotoPreview={gotoPreview}/>; break;
    case "preview":   page = <window.Preview project={project} bomList={bomList} columns={columns} onBack={()=>setRoute("builder")} onGenerate={generate}/>; break;
    case "catalog":   page = <window.Catalog/>; break;
    case "vendors":   page = <window.Vendors/>; break;
    case "approval":  page = <window.Approvals/>; break;
    case "history":   page = <window.History/>; break;
    default: page = <window.Dashboard openProject={openProject} setRoute={setRoute}/>;
  }

  return (
    <div className="app">
      <window.Sidebar route={route} setRoute={setRoute}/>
      <div className="main">
        <window.Topbar route={route} project={route==="builder" || route==="preview" ? project : null}/>
        <div className="content">{page}</div>
      </div>

      {/* Tweaks panel */}
      <window.TweaksPanel title="Tweaks">
        <window.TweakSection title="Builder layout">
          <window.TweakRadio label="Filters position" value={tweaks.layout} onChange={v => setTweak("layout", v)}
            options={[{value:"split", label:"Side"},{value:"stacked", label:"Top"}]}/>
        </window.TweakSection>
        <window.TweakSection title="BOM table columns">
          <window.TweakToggle label="SKU / Part #" value={tweaks.showSku} onChange={v=>setTweak("showSku", v)}/>
          <window.TweakToggle label="Description" value={tweaks.showDesc} onChange={v=>setTweak("showDesc", v)}/>
          <window.TweakToggle label="Category" value={tweaks.showCat} onChange={v=>setTweak("showCat", v)}/>
          <window.TweakToggle label="Vendor" value={tweaks.showVendor} onChange={v=>setTweak("showVendor", v)}/>
          <window.TweakToggle label="Unit" value={tweaks.showUnit} onChange={v=>setTweak("showUnit", v)}/>
          <window.TweakToggle label="Quantity" value={tweaks.showQty} onChange={v=>setTweak("showQty", v)}/>
          <window.TweakToggle label="Unit price" value={tweaks.showPrice} onChange={v=>setTweak("showPrice", v)}/>
          <window.TweakToggle label="Total price" value={tweaks.showTotal} onChange={v=>setTweak("showTotal", v)}/>
          <window.TweakToggle label="Stock status" value={tweaks.showStock} onChange={v=>setTweak("showStock", v)}/>
        </window.TweakSection>
      </window.TweaksPanel>

      {/* Generate confirmation modal */}
      {showGenerate && (
        <div className="modal-overlay" onClick={() => setShowGenerate(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div style={{display:"flex", alignItems:"center", gap:10}}>
                <div style={{width:32, height:32, borderRadius:8, background:"var(--accent-soft)", color:"var(--accent)", display:"grid", placeItems:"center"}}>
                  <I.Sheet/>
                </div>
                <div>
                  <div style={{fontWeight:600}}>Generate Excel file</div>
                  <div className="muted" style={{fontSize:12}}>Confirm details before export</div>
                </div>
              </div>
            </div>
            <div className="modal-body">
              <dl className="kv">
                <dt>File name</dt>
                <dd className="mono" style={{fontSize:12}}>BOM_{project?.code || "DRAFT"}_Rev_A.xls</dd>
                <dt>Project</dt>
                <dd>{project?.name || "New BOM"}</dd>
                <dt>Format</dt>
                <dd>Excel Workbook (.xls)</dd>
                <dt>Lines</dt>
                <dd>{bomList.length}</dd>
                <dt>Will be archived to</dt>
                <dd>History → {project?.code}</dd>
              </dl>
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setShowGenerate(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={downloadExcel}><I.Download/> Generate & download</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="toast">
          <I.CheckCircle/>
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
