import Link from "next/link";
import { listItems, listCategories } from "@/server/queries/catalog";
import { listVendors } from "@/server/queries/vendors";
import { PageHead } from "@/components/master/page-head";
import { CatalogTabs, CatalogSearch } from "@/components/master/catalog-filters";
import { ItemDialog } from "@/components/master/item-dialog";
import { Icon } from "@/components/icons";

export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ cat?: string; q?: string }> }) {
  const sp = await searchParams;
  const [cats, vendors, results] = await Promise.all([
    listCategories(),
    listVendors(),
    listItems({ categoryId: sp.cat && sp.cat !== "all" ? sp.cat : undefined, search: sp.q }),
  ]);
  const totalItems = cats.reduce((s, c) => s + c.itemCount, 0);

  return (
    <>
      <PageHead
        title="Item Catalog"
        subtitle={`Master data for all components. ${totalItems} active SKUs across ${cats.length} categories.`}
        actions={
          <>
            <a href="/api/exports/catalog.xlsx" className="btn"><Icon.Download className="ico" /> Export</a>
            <Link href="/catalog/import" className="btn"><Icon.Upload className="ico" /> Import</Link>
            <ItemDialog
              vendors={vendors}
              categories={cats}
              trigger={<button type="button" className="btn btn-primary"><Icon.Plus className="ico" /> New item</button>}
            />
          </>
        }
      />

      <CatalogTabs categories={cats} totalCount={totalItems} />

      <div className="card">
        <div className="card-head">
          <CatalogSearch />
          <div className="spacer" />
          <span className="muted" style={{ fontSize: 12 }}>{results.length} results</span>
          <button className="btn btn-sm"><Icon.Filter className="ico" /> Filter</button>
        </div>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>SKU</th><th>Description</th><th>Category</th><th>Manufacturer</th>
                <th>Vendor</th><th>Unit</th><th></th>
              </tr>
            </thead>
            <tbody>
              {results.slice(0, 80).map((it) => (
                <tr key={it.id}>
                  <td className="mono" style={{ fontSize: 11.5 }}>{it.sku}</td>
                  <td><div style={{ fontWeight: 500 }}>{it.description}</div></td>
                  <td className="muted">{it.subcategoryName ?? it.categoryName ?? "—"}</td>
                  <td>{it.manufacturer}</td>
                  <td>{it.vendorName ?? "—"}</td>
                  <td className="muted">{it.unit}</td>
                  <td><button type="button" className="btn btn-icon btn-ghost"><Icon.More className="ico" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
