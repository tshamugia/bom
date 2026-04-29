import { S3Client, PutObjectCommand, GetObjectCommand, type PutObjectCommandInput } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "./env";

const credentials =
  env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
    ? { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY }
    : undefined;

export const s3 = new S3Client({ region: env.AWS_REGION, credentials });

export async function putObject(key: string, body: PutObjectCommandInput["Body"], contentType: string) {
  await s3.send(new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Body: body, ContentType: contentType }));
  return { key, bucket: env.S3_BUCKET };
}

export async function presignDownload(key: string, expiresIn = 60 * 5) {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }), { expiresIn });
}
