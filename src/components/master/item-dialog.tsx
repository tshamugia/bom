"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ItemInput, createItem } from "@/server/actions/items";

export function ItemDialog({
  vendors, categories, trigger,
}: {
  vendors: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  trigger: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const form = useForm({
    resolver: zodResolver(ItemInput),
    defaultValues: {
      sku: "", description: "", manufacturer: "", unit: "pcs", unitPrice: "0",
      onHand: 0, stockState: "in-stock" as const,
      vendorId: vendors[0]?.id ?? null, categoryId: categories[0]?.id ?? null, subcategoryId: null,
    },
  });

  function onSubmit(values: Parameters<typeof createItem>[0]) {
    start(async () => { await createItem(values); setOpen(false); form.reset(); });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader><DialogTitle>New item</DialogTitle></DialogHeader>
        <form className="space-y-3" onSubmit={form.handleSubmit(onSubmit)}>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>SKU</Label><Input {...form.register("sku")} /></div>
            <div className="space-y-1.5"><Label>Manufacturer</Label><Input {...form.register("manufacturer")} /></div>
          </div>
          <div className="space-y-1.5"><Label>Description</Label><Input {...form.register("description")} /></div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label>Unit</Label><Input {...form.register("unit")} /></div>
            <div className="space-y-1.5"><Label>Unit price</Label><Input {...form.register("unitPrice")} /></div>
            <div className="space-y-1.5"><Label>On hand</Label><Input type="number" {...form.register("onHand", { valueAsNumber: true })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Vendor</Label>
              <Select value={form.watch("vendorId") ?? ""} onValueChange={v => form.setValue("vendorId", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{vendors.map(v => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.watch("categoryId") ?? ""} onValueChange={v => form.setValue("categoryId", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Create"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
