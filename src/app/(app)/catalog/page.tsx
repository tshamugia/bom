import Link from "next/link";
import { listItems, listCategories } from "@/server/queries/catalog";
import { listVendors } from "@/server/queries/vendors";
import { PageHead } from "@/components/master/page-head";
import { CatalogTabs, CatalogSearch } from "@/components/master/catalog-filters";
import { ItemDialog } from "@/components/master/item-dialog";
import { Icon } from "@/components/icons";
import { canEdit } from "@/lib/roles";
import { requireSession } from "@/server/auth-context";

const MAX_ROWS = 80;

export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ cat?: string; q?: string }> }) {
  const sp = await searchParams;
  const session = await requireSession();
  const readOnly = !canEdit(session.user);
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
            {!readOnly && (
              <>
                <Link href="/catalog/import" className="btn"><Icon.Upload className="ico" /> Import</Link>
                <ItemDialog
                  vendors={vendors}
                  categories={cats}
                  trigger={<button type="button" className="btn btn-primary"><Icon.Plus className="ico" /> New item</button>}
                />
              </>
            )}
          </>
        }
      />

      <CatalogTabs categories={cats} totalCount={totalItems} />

      <div className="card">
        <div className="card-head">
          <CatalogSearch />
          <div className="spacer" />
          <span className="muted" style={{ fontSize: 12 }}>{results.length} results</span>
        </div>
        <div className="table-wrap">
          <table className="tbl tbl-cards">
            <thead>
              <tr>
                <th>SKU</th><th>Description</th><th>Category</th><th>Manufacturer</th>
                <th>Vendor</th><th>Unit</th>
              </tr>
            </thead>
            <tbody>
              {results.slice(0, MAX_ROWS).map((it) => (
                <tr key={it.id}>
                  <td className="mono td-full" style={{ fontSize: 11.5 }}>{it.sku}</td>
                  <td className="td-main"><div style={{ fontWeight: 500 }}>{it.description}</div></td>
                  <td className="muted" data-label="Category">{it.subcategoryName ?? it.categoryName ?? "—"}</td>
                  <td data-label="Manufacturer">{it.manufacturer}</td>
                  <td data-label="Vendor">{it.vendorName ?? "—"}</td>
                  <td className="muted" data-label="Unit">{it.unit}</td>
                </tr>
              ))}
              {results.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted" style={{ textAlign: "center", padding: "28px 14px" }}>
                    No items match your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {results.length > MAX_ROWS && (
          <div className="muted" style={{ fontSize: 12, padding: "10px 16px", borderTop: "1px solid var(--line-soft)" }}>
            Showing the first {MAX_ROWS} of {results.length} items — search by SKU, description or manufacturer to narrow the list.
          </div>
        )}
      </div>
    </>
  );
}
