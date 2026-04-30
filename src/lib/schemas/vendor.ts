import { z } from "zod";

export const VendorInput = z.object({
  name: z.string().min(1),
  code: z.string().min(1).max(8),
  country: z.string().min(2).max(2),
  leadTime: z.string().min(1),
  rating: z.number().min(0).max(5),
  status: z.enum(["preferred", "approved", "review"]),
});

export type VendorInput = z.infer<typeof VendorInput>;

export const VendorPatch = VendorInput.partial().extend({ id: z.string().min(1) });
export type VendorPatch = z.infer<typeof VendorPatch>;
