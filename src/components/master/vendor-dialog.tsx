"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { VendorInput, createVendor, updateVendor } from "@/server/actions/vendors";

type Vendor = {
  id: string; name: string; code: string; country: string;
  leadTime: string; rating: number; status: "preferred" | "approved" | "review";
};

export function VendorDialog({ existing, trigger }: { existing?: Vendor; trigger: React.ReactElement }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const form = useForm({
    resolver: zodResolver(VendorInput),
    defaultValues: existing ?? { name: "", code: "", country: "US", leadTime: "3-5d", rating: 4.5, status: "approved" as const },
  });

  function onSubmit(values: Parameters<typeof createVendor>[0]) {
    start(async () => {
      if (existing) await updateVendor({ id: existing.id, ...values });
      else await createVendor(values);
      setOpen(false);
      form.reset();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader><DialogTitle>{existing ? "Edit vendor" : "Add vendor"}</DialogTitle></DialogHeader>
        <form className="space-y-3" onSubmit={form.handleSubmit(onSubmit)}>
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input {...form.register("name")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Code</Label>
              <Input {...form.register("code")} maxLength={8} />
            </div>
            <div className="space-y-1.5">
              <Label>Country (ISO)</Label>
              <Input {...form.register("country")} maxLength={2} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Lead time</Label>
              <Input {...form.register("leadTime")} placeholder="3-5d" />
            </div>
            <div className="space-y-1.5">
              <Label>Rating</Label>
              <Input type="number" step="0.1" min={0} max={5} {...form.register("rating", { valueAsNumber: true })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={form.watch("status")} onValueChange={v => form.setValue("status", v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="preferred">Preferred</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="review">Under review</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : existing ? "Save" : "Create"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
