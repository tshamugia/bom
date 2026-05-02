import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, type PutObjectCommandInput } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "./env";

const credentials =
  env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
    ? { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY }
    : undefined;

export const s3 = new S3Client({
  region: env.AWS_REGION,
  credentials,
  endpoint: env.AWS_S3_ENDPOINT,
  forcePathStyle: env.S3_FORCE_PATH_STYLE === "true",
});

export async function putObject(key: string, body: PutObjectCommandInput["Body"], contentType: string) {
  await s3.send(new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Body: body, ContentType: contentType }));
  return { key, bucket: env.S3_BUCKET };
}

export async function presignDownload(key: string, expiresIn = 60 * 5) {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }), { expiresIn });
}

const STAGING_PREFIX = "imports";

export function stagingKey(orgId: string, importId: string): string {
  return `${STAGING_PREFIX}/${orgId}/${importId}.xlsx`;
}

export function errorsKey(orgId: string, importId: string): string {
  return `${STAGING_PREFIX}/${orgId}/${importId}-errors.xlsx`;
}

export async function getStagingBuffer(key: string): Promise<Buffer | null> {
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
    if (!res.Body) return null;
    const chunks: Uint8Array[] = [];
    for await (const chunk of res.Body as AsyncIterable<Uint8Array>) chunks.push(chunk);
    return Buffer.concat(chunks);
  } catch (e: unknown) {
    if (typeof e === "object" && e && "name" in e && (e as { name: string }).name === "NoSuchKey") return null;
    throw e;
  }
}

export async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
}
