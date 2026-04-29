// Catalog browser
function Catalog() {
  const I = window.Icon;
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return window.ITEMS.filter(it => {
      if (cat !== "all" && it.cat !== cat) return false;
      if (q && !(it.sku.toLowerCase().includes(q) || it.desc.toLowerCase().includes(q) || it.mfr.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [search, cat]);

  const stockBadge = (s) => {
    const m = { "in-stock":["b-green","In stock"], "low-stock":["b-amber","Low"], "backorder":["b-red","Backorder"], "out-of-stock":["b-red","Out"] }[s];
    return <span className={"badge " + m[0]}><span className="dot"/>{m[1]}</span>;
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Item Catalog</h1>
          <p className="page-sub">Master data for all components. {window.ITEMS.length} active SKUs across {window.CATEGORIES.length} categories.</p>
        </div>
        <div className="split">
          <button className="btn"><I.Download/> Export</button>
          <button className="btn btn-primary"><I.Plus/> New item</button>
        </div>
      </div>

      <div className="tabs">
        <button className={"tab " + (cat==="all"?"active":"")} onClick={()=>setCat("all")}>All <span className="muted">· {window.ITEMS.length}</span></button>
        {window.CATEGORIES.map(c => (
          <button key={c.id} className={"tab " + (cat===c.name?"active":"")} onClick={()=>setCat(c.name)}>
            {c.name} <span className="muted">· {window.ITEMS.filter(i=>i.cat===c.name).length}</span>
          </button>
        ))}
      </div>

      <div className="card">
        <div className="card-head">
          <div className="search-combo" style={{flex:1, maxWidth:360, position:"relative"}}>
            <I.Search/>
            <input className="input" style={{paddingLeft:32}} placeholder="Search SKU, description, manufacturer…" value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
          <div className="spacer"/>
          <span className="muted" style={{fontSize:12}}>{filtered.length} results</span>
          <button className="btn btn-sm"><I.Filter/> Filter</button>
        </div>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr>
              <th>SKU</th><th>Description</th><th>Category</th><th>Manufacturer</th><th>Vendor</th>
              <th>Unit</th><th className="num">On hand</th><th className="num">Price</th><th>Stock</th><th></th>
            </tr></thead>
            <tbody>
              {filtered.slice(0, 30).map(it => (
                <tr key={it.sku}>
                  <td className="mono" style={{fontSize:11.5}}>{it.sku}</td>
                  <td><div style={{fontWeight:500}}>{it.desc}</div></td>
                  <td className="muted">{it.sub}</td>
                  <td>{it.mfr}</td>
                  <td>{it.vendor}</td>
                  <td className="muted">{it.unit}</td>
                  <td className="num tabular">{it.qty.toLocaleString()}</td>
                  <td className="num tabular">${it.price.toFixed(3)}</td>
                  <td>{stockBadge(it.stock)}</td>
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
window.Catalog = Catalog;
