import "server-only";
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { isOwnedObjectKey } from "@/lib/video";

export function r2Configured() {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET_NAME,
  );
}

let sharedClient: S3Client | null = null;

/** One client per server instance: building it (credentials, endpoint, middleware stack) on every request is wasted work. */
function client() {
  sharedClient ??= new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
    },
    // R2 expects path-style URLs (https://<account>.r2.cloudflarestorage.com/<bucket>/<key>).
    forcePathStyle: true,
  });
  return sharedClient;
}

function bucket() {
  return process.env.R2_BUCKET_NAME ?? "";
}

function ttl(name: "CLIP_UPLOAD_URL_TTL_SECONDS" | "CLIP_PLAYBACK_URL_TTL_SECONDS", fallback: number, max: number) {
  const raw = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(Math.max(Math.floor(raw), 60), max);
}

export function publicObjectUrl(key: string) {
  const base = process.env.R2_PUBLIC_URL?.replace(/\/$/, "");
  if (!base || !isOwnedObjectKey(key, key.split("/")[1] ?? "")) return null;
  return `${base}/${key}`;
}

export async function createUploadUrl(key: string, contentType: string, contentLength: number) {
  const url = await getSignedUrl(
    client(),
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      ContentType: contentType,
      ContentLength: contentLength,
    }),
    { expiresIn: ttl("CLIP_UPLOAD_URL_TTL_SECONDS", 900, 3600) },
  );
  return { url, headers: { "Content-Type": contentType } };
}

/**
 * A short-lived signed GET URL for a private or unlisted object.
 *
 * The signing time is rounded down to a bucket (a sixth of the TTL, at most 10 minutes), so every request in
 * the same bucket gets the identical URL. That lets the browser reuse bytes it already downloaded (feed card to
 * viewer) and lets the player reuse a URL it already holds. The expiry is still signing time + TTL, so a URL
 * is never valid for longer than the configured TTL. `fresh` signs at the exact current time instead; the player
 * asks for that after a URL fails.
 */
export async function createPlaybackUrl(key: string, options: { fresh?: boolean } = {}) {
  const expiresIn = ttl("CLIP_PLAYBACK_URL_TTL_SECONDS", 3600, 43_200);
  const now = Date.now();
  const bucketMs = options.fresh ? 0 : Math.min(600, Math.floor(expiresIn / 6)) * 1000;
  const signedAt = bucketMs > 0 ? Math.floor(now / bucketMs) * bucketMs : now;
  const url = await getSignedUrl(
    client(),
    new GetObjectCommand({ Bucket: bucket(), Key: key }),
    { expiresIn, signingDate: new Date(signedAt) },
  );
  return { url, expiresAt: new Date(signedAt + expiresIn * 1000).toISOString() };
}

export async function statObject(key: string) {
  try {
    const head = await client().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return { exists: true as const, size: head.ContentLength ?? null, contentType: head.ContentType ?? null };
  } catch (error) {
    const status = error && typeof error === "object" && "$metadata" in error
      ? Number((error.$metadata as { httpStatusCode?: number }).httpStatusCode)
      : 0;
    const name = error && typeof error === "object" && "name" in error ? String(error.name) : "";
    if (status === 404 || name === "NotFound" || name === "NoSuchKey") {
      return { exists: false as const, size: null, contentType: null };
    }
    throw error;
  }
}

export async function readObjectPrefix(key: string, length = 12) {
  const response = await client().send(
    new GetObjectCommand({ Bucket: bucket(), Key: key, Range: `bytes=0-${length - 1}` }),
  );
  const bytes = await response.Body?.transformToByteArray();
  return bytes ? new Uint8Array(bytes) : new Uint8Array();
}

export async function deleteObject(key: string) {
  if (!isOwnedObjectKey(key, key.split("/")[1] ?? "")) return { ok: false, missing: false };
  try {
    await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
    return { ok: true, missing: false };
  } catch (error) {
    const name = error && typeof error === "object" && "name" in error ? String(error.name) : "";
    if (name === "NotFound" || name === "NoSuchKey") return { ok: true, missing: true };
    return { ok: false, missing: false };
  }
}

export async function deleteObjects(keys: string[]) {
  const safe = keys.filter((key) => isOwnedObjectKey(key, key.split("/")[1] ?? ""));
  const deleted: string[] = [];
  const failed = keys.filter((key) => !safe.includes(key));
  for (let index = 0; index < safe.length; index += 1000) {
    const batch = safe.slice(index, index + 1000);
    const result = await client().send(
      new DeleteObjectsCommand({
        Bucket: bucket(),
        Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: false },
      }),
    );
    for (const item of result.Deleted ?? []) if (item.Key) deleted.push(item.Key);
    for (const item of result.Errors ?? []) if (item.Key) failed.push(item.Key);
  }
  return { deleted, failed };
}
