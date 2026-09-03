import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "../config.js";

// The S3 client is created lazily so importing this module doesn't
// construct a client until the first object operation.
let client: S3Client | undefined;

function getBucket(): string {
  return config.s3.bucket;
}

function getClient(): S3Client {
  if (client) return client;

  const endpoint = config.s3.endpoint;
  // endpoint set => talking to MinIO (or another self-hosted S3-compatible
  // service) locally, which requires path-style addressing; unset => real
  // AWS S3 or a cloud provider using standard virtual-hosted addressing.
  client = new S3Client({
    ...(endpoint ? { endpoint } : {}),
    forcePathStyle: Boolean(endpoint),
    region: config.s3.region,
    credentials: {
      accessKeyId: config.s3.accessKeyId,
      secretAccessKey: config.s3.secretAccessKey,
    },
  });
  return client;
}

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await getClient().send(
    new PutObjectCommand({ Bucket: getBucket(), Key: key, Body: body, ContentType: contentType })
  );
}

export async function getPresignedDownloadUrl(
  key: string,
  expiresInSeconds = 300,
  downloadFilename?: string
): Promise<string> {
  return getSignedUrl(
    getClient(),
    new GetObjectCommand({
      Bucket: getBucket(),
      Key: key,
      ...(downloadFilename ? { ResponseContentDisposition: `attachment; filename="${downloadFilename}"` } : {}),
    }),
    { expiresIn: expiresInSeconds }
  );
}

export async function listObjects(prefix: string): Promise<{ key: string; lastModified: Date }[]> {
  const results: { key: string; lastModified: Date }[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await getClient().send(
      new ListObjectsV2Command({ Bucket: getBucket(), Prefix: prefix, ContinuationToken: continuationToken })
    );
    for (const object of response.Contents ?? []) {
      if (object.Key && object.LastModified) {
        results.push({ key: object.Key, lastModified: object.LastModified });
      }
    }
    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return results;
}

export async function deleteObjects(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  await getClient().send(
    new DeleteObjectsCommand({
      Bucket: getBucket(),
      Delete: { Objects: keys.map((key) => ({ Key: key })) },
    })
  );
}

/**
 * Idempotently ensures the configured bucket exists. Fails soft (logs a
 * warning, never throws) - real cloud deployments commonly use scoped IAM
 * credentials that can't CreateBucket, where the bucket is provisioned
 * out-of-band instead.
 */
export async function ensureBucketExists(): Promise<void> {
  const bucket = getBucket();
  try {
    await getClient().send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    try {
      await getClient().send(new CreateBucketCommand({ Bucket: bucket }));
    } catch (err: unknown) {
      const name = err instanceof Error ? err.name : "";
      if (name === "BucketAlreadyOwnedByYou" || name === "BucketAlreadyExists") return;
      console.warn(`[storage] could not ensure bucket "${bucket}" exists:`, err);
    }
  }
}
