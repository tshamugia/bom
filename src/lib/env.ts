import { z } from "zod";

/** `VAR=` (empty) in an env file or a Railway variable means "not set". */
const blankIsUnset = <T extends z.ZodType>(schema: T) => z.preprocess(v => (v === "" ? undefined : v), schema);

const Schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  NEXT_PUBLIC_BETTER_AUTH_URL: z.string().url(),
  AWS_REGION: z.string().min(1),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_S3_ENDPOINT: z.string().url().optional(),
  S3_BUCKET: z.string().min(1),
  S3_FORCE_PATH_STYLE: z.string().optional(),
  EMAIL_FROM: z.string().email(),
  SMTP_HOST: z.string().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z
    .union([z.boolean(), z.string()])
    .default(false)
    .transform((v) => (typeof v === "boolean" ? v : /^(1|true|yes|on)$/i.test(v.trim()))),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  ROOT_USER_EMAIL: z.string().email().default("t.shamugia@insta.ge"),
  ROOT_USER_PASSWORD: z.string().min(8).default("Password123"),
  ROOT_USER_NAME: z.string().default("Tengo Shamugia"),
  // Baked into the image by the Docker build (.github/workflows/images.yml); /api/health reports them.
  APP_VERSION: z.string().optional(),
  APP_REVISION: z.string().optional(),
  // Automatic DXF checks (services/dxf-checker, issue #18). Without all three the
  // check card says the checker isn't connected and uploads are refused.
  /** e.g. http://dxf-checker.railway.internal:8080 — private network only. */
  DXF_CHECKER_URL: blankIsUnset(z.string().url().optional()),
  /** The same value as the service's DXF_CHECKER_SECRET; signs requests both ways. */
  DXF_CHECKER_SECRET: blankIsUnset(z.string().min(32).optional()),
  /** Where the checker posts results, e.g. http://bom.railway.internal:3000 */
  APP_INTERNAL_URL: blankIsUnset(z.string().url().optional()),
});

const parsed = Schema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment:", parsed.error.flatten().fieldErrors);
  throw new Error("Environment validation failed");
}

export const env = parsed.data;
