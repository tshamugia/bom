"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "@/lib/toast";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ItemInput } from "@/lib/schemas/item";
import { createItem, updateItem } from "@/server/actions/items";

export type CatalogItem = ItemInput & { id: string };

const SELECT_CLASS = "h-9 w-full min-w-0 rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-3 text-[13px]";

export function ItemDialog({
  existing, vendors, categories, trigger,
}: {
  existing?: CatalogItem;
  vendors: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  trigger: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const defaults = (): ItemInput => existing
    ? {
        sku: existing.sku, description: existing.description, manufacturer: existing.manufacturer, unit: existing.unit,
        vendorId: existing.vendorId, categoryId: existing.categoryId, subcategoryId: existing.subcategoryId,
      }
    : {
        sku: "", description: "", manufacturer: "", unit: "pcs",
        vendorId: vendors[0]?.id ?? null, categoryId: categories[0]?.id ?? null, subcategoryId: null,
      };
  const form = useForm({ resolver: zodResolver(ItemInput), defaultValues: defaults() });
  const errors = form.formState.errors;

  function onOpenChange(next: boolean) {
    // Start from the item as it is now, not from an earlier unsaved edit.
    if (next) form.reset(defaults());
    setOpen(next);
  }

  function onSubmit(values: ItemInput) {
    start(async () => {
      // No subcategory on edit: the server keeps it, or drops it when the category changes.
      const { sku, description, manufacturer, unit, vendorId, categoryId } = values;
      const res = existing
        ? await updateItem({ id: existing.id, sku, description, manufacturer, unit, vendorId, categoryId })
        : await createItem(values);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(existing ? `Item ${values.sku} saved` : `Item ${values.sku} added`);
      setOpen(false);
    });
  }

  const nullable = (v: string) => (v === "" ? null : v);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{existing ? `Edit ${existing.sku}` : "New item"}</DialogTitle>
          {existing && (
            <DialogDescription>BOMs that already use this item keep the details they were built with.</DialogDescription>
          )}
        </DialogHeader>
        <form className="space-y-3" onSubmit={form.handleSubmit(onSubmit)}>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="item-sku">SKU</Label>
              <Input id="item-sku" maxLength={64} aria-invalid={!!errors.sku} {...form.register("sku")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="item-manufacturer">Manufacturer</Label>
              <Input id="item-manufacturer" aria-invalid={!!errors.manufacturer} {...form.register("manufacturer")} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="item-description">Description</Label>
            <Input id="item-description" aria-invalid={!!errors.description} {...form.register("description")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="item-unit">Unit</Label>
            <Input id="item-unit" aria-invalid={!!errors.unit} {...form.register("unit")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="item-vendor">Vendor</Label>
              <select
                id="item-vendor"
                className={SELECT_CLASS}
                {...form.register("vendorId", { setValueAs: nullable })}
              >
                <option value="">— None —</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="item-category">Category</Label>
              <select
                id="item-category"
                className={SELECT_CLASS}
                {...form.register("categoryId", { setValueAs: nullable })}
              >
                <option value="">— None —</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          {Object.keys(errors).length > 0 && (
            <p className="text-[12px] text-[var(--red)]">SKU, manufacturer, description and unit are required.</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : existing ? "Save" : "Create"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
