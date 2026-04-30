import { z } from "zod";

export const ProjectInput = z.object({
  code: z.string().min(1).max(32),
  name: z.string().min(1),
  quantity: z.number().int().positive().default(1),
  targetDate: z.string().optional(), // YYYY-MM-DD
});

export type ProjectInput = z.infer<typeof ProjectInput>;

export const ProjectPatch = ProjectInput.partial().extend({
  id: z.string().min(1),
  status: z.enum(["draft", "in-progress", "review", "approved"]).optional(),
});

export type ProjectPatch = z.infer<typeof ProjectPatch>;
