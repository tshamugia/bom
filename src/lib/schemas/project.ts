import { z } from "zod";

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** The two parts of a project code (NAMING §4.2, `src/lib/codes.ts`). */
export const CodeYear = z.string().regex(/^\d{2}$/);
export const CodeLetters = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/);

// The code is set when the project is created: year + letters, each suggested
// (this year, letters from the name) when left out. Only an admin changes it
// later, through the passport.
export const ProjectInput = z.object({
  name: z.string().trim().min(1).max(200),
  clientName: z.string().trim().max(200).optional(),
  targetDate: z.string().optional(), // YYYY-MM-DD
  ownerId: z.string().min(1).optional(),
  codeYear: CodeYear.optional(),
  codeLetters: CodeLetters.optional(),
});

export type ProjectInput = z.infer<typeof ProjectInput>;

export const ProjectPatch = z.object({
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  targetDate: z.string().nullable().optional(),
  ownerId: z.string().min(1).nullable().optional(),
});

export type ProjectPatch = z.infer<typeof ProjectPatch>;

const Optional = (max: number) => z.string().trim().max(max).nullable();

/** Everything the passport dialog edits; empty text is stored as null. */
export const ProjectPassportInput = z.object({
  id: z.string().min(1),
  /** Admins only; a different value renames the project's code (format checked by the action). */
  code: z.string().trim().toUpperCase().max(20).optional(),
  name: z.string().trim().min(1).max(200),
  ownerId: z.string().min(1).nullable(),
  clientName: Optional(200),
  contractNo: Optional(100),
  siteAddress: Optional(300),
  description: Optional(4000),
  startDate: IsoDate.nullable(),
  targetDate: IsoDate.nullable(),
});

export type ProjectPassportInput = z.infer<typeof ProjectPassportInput>;

export const ProjectContactInput = z.object({
  name: z.string().trim().min(1).max(200),
  role: Optional(100),
  company: Optional(200),
  phone: Optional(50),
  email: z.string().trim().email().max(200).nullable(),
});

export type ProjectContactInput = z.infer<typeof ProjectContactInput>;

export const ProjectMilestoneInput = z.object({
  name: z.string().trim().min(1).max(200),
  dueDate: IsoDate,
});

export type ProjectMilestoneInput = z.infer<typeof ProjectMilestoneInput>;
