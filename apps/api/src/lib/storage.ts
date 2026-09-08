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
  // Whether to use path-style (bucket in the URL path) vs virtual-hosted-style
  // (bucket in the hostname) addressing is a property of the specific
  // S3-compatible provider, not simply whether a custom endpoint is set -
  // MinIO (local dev) needs path-style, but not every managed provider that
  // requires a custom endpoint does. See config.s3.forcePathStyle /
  // S3_FORCE_PATH_STYLE.
  client = new S3Client({
    ...(endpoint ? { endpoint } : {}),
    forcePathStyle: config.s3.forcePathStyle,
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

// S3's DeleteObjects API hard-caps at 1000 keys per request.
const S3_DELETE_BATCH_LIMIT = 1000;

export async function deleteObjects(keys: string[]): Promise<void> {
  for (let i = 0; i < keys.length; i += S3_DELETE_BATCH_LIMIT) {
    const batch = keys.slice(i, i + S3_DELETE_BATCH_LIMIT);
    await getClient().send(
      new DeleteObjectsCommand({
        Bucket: getBucket(),
        Delete: { Objects: batch.map((key) => ({ Key: key })) },
      })
    );
  }
}

/** Issues the HeadBucket call used both to probe and to ensure the bucket exists. */
export function headBucket(): Promise<unknown> {
  return getClient().send(new HeadBucketCommand({ Bucket: getBucket() }));
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
    await headBucket();
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
