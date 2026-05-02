import Link from "next/link";
import { listItems, listCategories } from "@/server/queries/catalog";
import { listVendors } from "@/server/queries/vendors";
import { PageHead } from "@/components/master/page-head";
import { CatalogFilters } from "@/components/master/catalog-filters";
import { ItemDialog } from "@/components/master/item-dialog";
import { StockBadge } from "@/components/master/status-badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/icons";

export default async function CatalogPage({ searchParams }: { searchParams: Promise<{ cat?: string; q?: string }> }) {
  const sp = await searchParams;
  const [cats, vendors, results] = await Promise.all([
    listCategories(),
    listVendors(),
    listItems({ categoryId: sp.cat && sp.cat !== "all" ? sp.cat : undefined, search: sp.q }),
  ]);

  return (
    <>
      <PageHead
        title="Item Catalog"
        subtitle={`Master data for all components. ${results.length} results across ${cats.length} categories.`}
        actions={
          <>
            <Button variant="outline"><Icon.Download size={14} className="mr-1.5" /> Export</Button>
            <Link href="/catalog/import">
              <Button variant="outline"><Icon.Upload size={14} className="mr-1.5" /> Import</Button>
            </Link>
            <ItemDialog
              vendors={vendors}
              categories={cats}
              trigger={<Button><Icon.Plus size={14} className="mr-1.5" /> New item</Button>}
            />
          </>
        }
      />
      <CatalogFilters categories={cats} />

      <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="bg-[var(--color-surface-2)] text-[11px] uppercase tracking-wider text-[var(--color-text-3)]">
              <th className="px-4 py-2.5 text-left font-medium">SKU</th>
              <th className="px-4 py-2.5 text-left font-medium">Description</th>
              <th className="px-4 py-2.5 text-left font-medium">Category</th>
              <th className="px-4 py-2.5 text-left font-medium">Manufacturer</th>
              <th className="px-4 py-2.5 text-left font-medium">Vendor</th>
              <th className="px-4 py-2.5 text-left font-medium">Unit</th>
              <th className="px-4 py-2.5 text-right font-medium">On hand</th>
              <th className="px-4 py-2.5 text-right font-medium">Price</th>
              <th className="px-4 py-2.5 text-left font-medium">Stock</th>
            </tr>
          </thead>
          <tbody>
            {results.slice(0, 80).map(it => (
              <tr key={it.id} className="border-b border-[var(--color-line-soft)] last:border-0 hover:bg-[var(--color-surface-2)]">
                <td className="px-4 py-2.5 font-mono text-[11.5px]">{it.sku}</td>
                <td className="px-4 py-2.5 font-medium">{it.description}</td>
                <td className="px-4 py-2.5 text-[var(--color-text-3)]">{it.subcategoryName ?? it.categoryName}</td>
                <td className="px-4 py-2.5">{it.manufacturer}</td>
                <td className="px-4 py-2.5">{it.vendorName ?? "—"}</td>
                <td className="px-4 py-2.5 text-[var(--color-text-3)]">{it.unit}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{it.onHand.toLocaleString()}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">${Number(it.unitPrice).toFixed(3)}</td>
                <td className="px-4 py-2.5"><StockBadge state={it.stockState} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
