// Lets browsers post drawing PDFs straight to the bucket (presigned POST from
// the app's origin). Run once per bucket:
//
//   railway run --service bom -- node scripts/s3-cors.mjs
//   node --env-file=.env.local scripts/s3-cors.mjs http://localhost:3000
//
// Allowed origins: NEXT_PUBLIC_BETTER_AUTH_URL plus any origins passed as arguments.
// Local MinIO doesn't implement bucket CORS (501) — it already accepts every origin.
import { GetBucketCorsCommand, PutBucketCorsCommand, S3Client } from "@aws-sdk/client-s3";

const env = process.env;
const origins = [...new Set([env.NEXT_PUBLIC_BETTER_AUTH_URL, ...process.argv.slice(2)].filter(Boolean).map(o => new URL(o).origin))];
if (!env.S3_BUCKET || origins.length === 0) {
  console.error("Needs S3_BUCKET and NEXT_PUBLIC_BETTER_AUTH_URL (or origins as arguments).");
  process.exit(1);
}

const s3 = new S3Client({
  region: env.AWS_REGION,
  endpoint: env.AWS_S3_ENDPOINT,
  forcePathStyle: env.S3_FORCE_PATH_STYLE === "true",
});

await s3.send(new PutBucketCorsCommand({
  Bucket: env.S3_BUCKET,
  CORSConfiguration: {
    CORSRules: [{ AllowedOrigins: origins, AllowedMethods: ["POST"], AllowedHeaders: ["*"], MaxAgeSeconds: 3000 }],
  },
}));
const { CORSRules } = await s3.send(new GetBucketCorsCommand({ Bucket: env.S3_BUCKET }));
console.log(`CORS on ${env.S3_BUCKET}:`, JSON.stringify(CORSRules));
