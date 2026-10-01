import {
  S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand, type PutObjectCommandInput,
} from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
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

/**
 * `fileName` makes the bucket answer with that name and type — `inline` opens a
 * PDF in the browser, `attachment` saves it.
 */
export async function presignDownload(
  key: string,
  expiresIn = 60 * 5,
  as?: { fileName: string; contentType: string; disposition: "inline" | "attachment" },
) {
  const response = as
    ? { ResponseContentType: as.contentType, ResponseContentDisposition: contentDisposition(as.disposition, as.fileName) }
    : {};
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key, ...response }), { expiresIn });
}

/** `attachment; filename="ELV-101_rev3.pdf"; filename*=UTF-8''…` — ASCII fallback plus the exact name. */
export function contentDisposition(disposition: "inline" | "attachment", fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/**
 * A browser form upload straight to the bucket, so large files never pass
 * through the app. The policy pins the key and type and caps the size.
 */
export async function presignUpload(key: string, opts: { contentType: string; maxBytes: number; expiresIn?: number }) {
  return createPresignedPost(s3, {
    Bucket: env.S3_BUCKET,
    Key: key,
    Fields: { "Content-Type": opts.contentType },
    Conditions: [
      ["eq", "$Content-Type", opts.contentType],
      ["content-length-range", 1, opts.maxBytes],
    ],
    Expires: opts.expiresIn ?? 60 * 10,
  });
}

function isMissing(e: unknown): boolean {
  const name = typeof e === "object" && e && "name" in e ? (e as { name: unknown }).name : null;
  return name === "NoSuchKey" || name === "NotFound";
}

/** Size and type of a stored object, or `null` when it isn't there. */
export async function headObject(key: string): Promise<{ size: number; contentType: string | null } | null> {
  try {
    const res = await s3.send(new HeadObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
    return { size: res.ContentLength ?? 0, contentType: res.ContentType ?? null };
  } catch (e) {
    if (isMissing(e)) return null;
    throw e;
  }
}

/** The first `bytes` of an object — enough to check a file's signature without downloading it. */
export async function readObjectStart(key: string, bytes = 1024): Promise<Uint8Array | null> {
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Range: `bytes=0-${bytes - 1}` }));
    return res.Body ? await res.Body.transformToByteArray() : null;
  } catch (e) {
    if (isMissing(e)) return null;
    throw e;
  }
}

const STAGING_PREFIX = "imports";

export function stagingKey(importId: string): string {
  return `${STAGING_PREFIX}/${importId}.xlsx`;
}

export function errorsKey(importId: string): string {
  return `${STAGING_PREFIX}/${importId}-errors.xlsx`;
}

export async function getStagingBuffer(key: string): Promise<Buffer | null> {
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
    if (!res.Body) return null;
    const chunks: Uint8Array[] = [];
    for await (const chunk of res.Body as AsyncIterable<Uint8Array>) chunks.push(chunk);
    return Buffer.concat(chunks);
  } catch (e: unknown) {
    if (isMissing(e)) return null;
    throw e;
  }
}

export async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
}
