import { z } from "zod";

export const ItemInput = z.object({
  sku: z.string().min(1).max(64),
  description: z.string().min(1),
  manufacturer: z.string().min(1),
  unit: z.string().min(1),
  unitPrice: z.string().regex(/^\d+(\.\d+)?$/),
  onHand: z.number().int().nonnegative(),
  stockState: z.enum(["in-stock", "low-stock", "backorder", "out-of-stock"]),
  vendorId: z.string().nullable(),
  categoryId: z.string().nullable(),
  subcategoryId: z.string().nullable(),
});

export type ItemInput = z.infer<typeof ItemInput>;

export const ItemPatch = ItemInput.partial().extend({ id: z.string().min(1) });
export type ItemPatch = z.infer<typeof ItemPatch>;
