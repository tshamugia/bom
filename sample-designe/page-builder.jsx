// BOM Builder — filters left, search/dropdown + list right
function BomBuilder({ project, bomList, setBomList, columns, setColumns, layout, gotoPreview }) {
  const I = window.Icon;
  const [vendorFilter, setVendorFilter] = useState(new Set());
  const [catFilter, setCatFilter] = useState(new Set());
  const [subFilter, setSubFilter] = useState(new Set());
  const [stockFilter, setStockFilter] = useState(new Set());
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const dropRef = useRef();

  useEffect(() => {
    const onClick = (e) => { if (dropRef.current && !dropRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const toggle = (set, setter, v) => {
    const n = new Set(set);
    n.has(v) ? n.delete(v) : n.add(v);
    setter(n);
  };

  const filteredCatalog = useMemo(() => {
    const q = search.trim().toLowerCase();
    return window.ITEMS.filter(it => {
      if (vendorFilter.size && !vendorFilter.has(it.vendor)) return false;
      if (catFilter.size && !catFilter.has(it.cat)) return false;
      if (subFilter.size && !subFilter.has(it.sub)) return false;
      if (stockFilter.size && !stockFilter.has(it.stock)) return false;
      if (q && !(it.sku.toLowerCase().includes(q) || it.desc.toLowerCase().includes(q) || it.mfr.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [vendorFilter, catFilter, subFilter, stockFilter, search]);

  const itemBySku = useMemo(() => Object.fromEntries(window.ITEMS.map(i => [i.sku, i])), []);
  const bomDetails = bomList.map(b => ({ ...itemBySku[b.sku], qty: b.qty }));
  const lineCount = bomList.length;
  const totalUnits = bomList.reduce((s, b) => s + b.qty, 0);
  const totalValue = bomDetails.reduce((s, b) => s + b.qty * b.price, 0);
  const vendorCount = new Set(bomDetails.map(b => b.vendor)).size;

  const addItem = (sku) => {
    setBomList(prev => {
      const exist = prev.find(p => p.sku === sku);
      if (exist) return prev.map(p => p.sku === sku ? { ...p, qty: p.qty + 1 } : p);
      return [...prev, { sku, qty: 1 }];
    });
    setSearch("");
    setOpen(false);
  };

  const updateQty = (sku, qty) => {
    qty = Math.max(0, parseInt(qty) || 0);
    setBomList(prev => prev.map(p => p.sku === sku ? { ...p, qty } : p));
  };

  const removeItem = (sku) => setBomList(prev => prev.filter(p => p.sku !== sku));

  const stockBadge = (s) => {
    const m = {
      "in-stock":     ["b-green", "In stock"],
      "low-stock":    ["b-amber", "Low"],
      "backorder":    ["b-red", "Backorder"],
      "out-of-stock": ["b-red", "Out"],
    }[s];
    return <span className={"badge " + m[0]}><span className="dot"/>{m[1]}</span>;
  };

  // Filter group counts
  const countBy = (key) => {
    const map = {};
    for (const it of window.ITEMS) map[it[key]] = (map[it[key]] || 0) + 1;
    return map;
  };
  const vendorCounts = useMemo(() => countBy("vendor"), []);
  const catCounts = useMemo(() => countBy("cat"), []);
  const stockCounts = useMemo(() => countBy("stock"), []);

  const FilterCheck = ({ checked, onChange, name, count }) => (
    <label className="filter-row">
      <input type="checkbox" checked={checked} onChange={onChange}/>
      <span className="filter-name">{name}</span>
      <span className="filter-count">{count}</span>
    </label>
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title" style={{display:"flex", alignItems:"center", gap:10}}>
            {project ? project.name : "New BOM"}
            <span className="badge b-gray mono">{project?.code || "DRAFT-2412"}</span>
          </h1>
          <p className="page-sub">Build the bill of materials by adding items from the catalog. Filter, search, set quantities, then preview to generate.</p>
        </div>
        <div className="split">
          <div className="steps">
            <div className="step active"><span className="num">1</span> Build</div>
            <span className="arrow">›</span>
            <div className="step"><span className="num">2</span> Preview</div>
            <span className="arrow">›</span>
            <div className="step"><span className="num">3</span> Generate</div>
          </div>
          <button className="btn"><I.Copy/> Duplicate</button>
          <button className="btn btn-primary" onClick={gotoPreview}><I.Eye/> Preview</button>
        </div>
      </div>

      <div className={"builder " + (layout === "stacked" ? "layout-stacked" : "")}>
        {/* ── Filter panel ─────────────────────── */}
        <div className="filter-panel">
          <h4>
            <span style={{display:"flex", alignItems:"center", gap:6}}><I.Filter/> Filters</span>
            <button className="btn-ghost btn btn-sm" onClick={()=>{setVendorFilter(new Set());setCatFilter(new Set());setSubFilter(new Set());setStockFilter(new Set());}}>Clear</button>
          </h4>

          <div className="filter-group">
            <label className="field-label">Vendor</label>
            {window.VENDORS.slice(0,6).map(v => (
              <FilterCheck key={v.id}
                checked={vendorFilter.has(v.name)}
                onChange={() => toggle(vendorFilter, setVendorFilter, v.name)}
                name={v.name} count={vendorCounts[v.name] || 0}/>
            ))}
          </div>

          <hr className="div"/>
          <div className="filter-group">
            <label className="field-label">Category</label>
            {window.CATEGORIES.map(c => (
              <FilterCheck key={c.id}
                checked={catFilter.has(c.name)}
                onChange={() => toggle(catFilter, setCatFilter, c.name)}
                name={c.name} count={catCounts[c.name] || 0}/>
            ))}
          </div>

          {catFilter.size > 0 && (
            <>
              <hr className="div"/>
              <div className="filter-group">
                <label className="field-label">Subcategory</label>
                {window.CATEGORIES.filter(c => catFilter.has(c.name)).flatMap(c => c.subs).map(sub => (
                  <FilterCheck key={sub}
                    checked={subFilter.has(sub)}
                    onChange={() => toggle(subFilter, setSubFilter, sub)}
                    name={sub} count={window.ITEMS.filter(i => i.sub === sub).length}/>
                ))}
              </div>
            </>
          )}

          <hr className="div"/>
          <div className="filter-group">
            <label className="field-label">Stock availability</label>
            {["in-stock", "low-stock", "backorder"].map(s => (
              <FilterCheck key={s}
                checked={stockFilter.has(s)}
                onChange={() => toggle(stockFilter, setStockFilter, s)}
                name={s.replace("-"," ")} count={stockCounts[s] || 0}/>
            ))}
          </div>
        </div>

        {/* ── List + add ──────────────────────── */}
        <div className="card" style={{overflow:"hidden"}}>
          <div className="add-strip">
            <div className="search-combo" ref={dropRef}>
              <I.Search/>
              <input
                className="input"
                placeholder="Search SKU, description, or manufacturer to add to BOM…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
                onFocus={() => setOpen(true)}
              />
              {open && (
                <div className="dropdown">
                  {filteredCatalog.length === 0 && (
                    <div className="dropdown-empty">No items match the current filters.</div>
                  )}
                  {filteredCatalog.slice(0, 80).map(it => {
                    const inBom = bomList.find(b => b.sku === it.sku);
                    return (
                      <div key={it.sku} className="dropdown-row" onClick={() => addItem(it.sku)}>
                        <span className="mono" style={{fontSize:11.5}}>{it.sku}</span>
                        <span className="desc">{it.desc}</span>
                        <span className="price">${it.price.toFixed(3)}</span>
                        {inBom ? (
                          <span className="badge b-green"><I.Check/> In BOM</span>
                        ) : (
                          <button className="btn btn-sm btn-ghost"><I.Plus/></button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <button className="btn"><I.Sheet/> Import CSV</button>
            <div ref={null}>
              <button className="btn">
                <I.Sliders/> Columns
              </button>
            </div>
          </div>

          {bomList.length === 0 ? (
            <div style={{padding:"60px 24px", textAlign:"center", color:"var(--text-3)"}}>
              <div style={{fontSize:13.5, marginBottom:6}}>No items in this BOM yet</div>
              <div style={{fontSize:12}}>Use the search above or filters at left to add components.</div>
            </div>
          ) : (
            <div style={{overflow:"auto"}}>
            <table className="list-table">
              <thead>
                <tr>
                  <th style={{width:32}}>#</th>
                  {columns.sku && <th>SKU / Part #</th>}
                  {columns.desc && <th>Description</th>}
                  {columns.cat && <th>Category</th>}
                  {columns.vendor && <th>Vendor</th>}
                  {columns.unit && <th>Unit</th>}
                  {columns.qty && <th className="num">Qty</th>}
                  {columns.price && <th className="num">Unit price</th>}
                  {columns.total && <th className="num">Total</th>}
                  {columns.stock && <th>Stock</th>}
                  <th style={{width:32}}></th>
                </tr>
              </thead>
              <tbody>
                {bomDetails.map((it, i) => (
                  <tr key={it.sku}>
                    <td className="muted tabular" style={{fontSize:11}}>{String(i+1).padStart(2,"0")}</td>
                    {columns.sku && <td className="mono" style={{fontSize:11.5}}>{it.sku}</td>}
                    {columns.desc && <td>{it.desc}<div className="muted" style={{fontSize:11}}>{it.mfr}</div></td>}
                    {columns.cat && <td className="muted">{it.sub}</td>}
                    {columns.vendor && <td>{it.vendor}</td>}
                    {columns.unit && <td className="muted">{it.unit}</td>}
                    {columns.qty && <td className="num">
                      <input className="qty-input" type="number" min="0" value={it.qty} onChange={(e) => updateQty(it.sku, e.target.value)}/>
                    </td>}
                    {columns.price && <td className="num tabular">${it.price.toFixed(3)}</td>}
                    {columns.total && <td className="num tabular" style={{fontWeight:500}}>${(it.qty * it.price).toFixed(2)}</td>}
                    {columns.stock && <td>{stockBadge(it.stock)}</td>}
                    <td>
                      <div className="row-actions">
                        <button className="btn btn-icon btn-ghost" onClick={() => removeItem(it.sku)} title="Remove"><I.Trash/></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}

          <div className="summary-bar">
            <div className="summary-cell"><div className="lab">Lines</div><div className="val">{lineCount}</div></div>
            <div className="summary-cell"><div className="lab">Total units</div><div className="val">{totalUnits.toLocaleString()}</div></div>
            <div className="summary-cell"><div className="lab">Vendors</div><div className="val">{vendorCount}</div></div>
            <div className="summary-cell"><div className="lab">Total value</div><div className="val">${totalValue.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</div></div>
          </div>
        </div>
      </div>
    </>
  );
}
window.BomBuilder = BomBuilder;
