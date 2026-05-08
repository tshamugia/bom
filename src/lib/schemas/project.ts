import { z } from "zod";

export const ProjectInput = z.object({
  code: z.string().min(1).max(32),
  name: z.string().min(1),
  quantity: z.number().int().positive().default(1),
  targetDate: z.string().optional(), // YYYY-MM-DD
  ownerId: z.string().min(1).optional(),
});

export type ProjectInput = z.infer<typeof ProjectInput>;

export const ProjectPatch = z.object({
  id: z.string().min(1),
  code: z.string().min(1).max(32).optional(),
  name: z.string().min(1).optional(),
  quantity: z.number().int().positive().optional(),
  targetDate: z.string().nullable().optional(),
  ownerId: z.string().min(1).nullable().optional(),
});

export type ProjectPatch = z.infer<typeof ProjectPatch>;
