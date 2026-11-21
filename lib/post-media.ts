import "server-only";
import { readImageInfo } from "@/lib/image-meta";
import { commentImageKey, dimensionsAgree, dimensionsInRange, mediaKeyOwner, postMediaKey } from "@/lib/media";
import { createPlaybackUrl, readObjectPrefix, statObject } from "@/lib/r2";

export type MediaRow = { id: string; width: number; height: number; mime_type: string; position?: number };
export type SignedImage = { id: string; url: string; width: number; height: number };

/** Only keys built by lib/media.ts (a photo-post or comment-image shape) are ever signed, whatever calls this. */
async function sign(key: string | null) {
  if (!key || mediaKeyOwner(key) === null) return null;
  try {
    return (await createPlaybackUrl(key)).url;
  } catch {
    return null;
  }
}

function toSigned(row: MediaRow, url: string): SignedImage {
  return { id: row.id, url, width: row.width, height: row.height };
}

/**
 * Signed URLs for the images of a photo post, in order. Call this only for a post the viewer is allowed to see (the
 * database functions that return these rows have already checked visibility). Images that cannot be signed are skipped.
 */
export async function signPostImages(ownerId: string, postId: string, media: MediaRow[]): Promise<SignedImage[]> {
  const signed = await Promise.all(
    [...media]
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map(async (row) => {
        const url = await sign(postMediaKey(ownerId, postId, row.id, row.mime_type));
        return url ? toSigned(row, url) : null;
      }),
  );
  return signed.filter((item): item is SignedImage => item !== null);
}

export async function signPostCover(ownerId: string, postId: string, cover: MediaRow | null | undefined) {
  if (!cover) return null;
  const url = await sign(postMediaKey(ownerId, postId, cover.id, cover.mime_type));
  return url ? toSigned(cover, url) : null;
}

export async function signCommentImage(ownerId: string, media: MediaRow | null | undefined) {
  if (!media) return null;
  const url = await sign(commentImageKey(ownerId, media.id, media.mime_type));
  return url ? toSigned(media, url) : null;
}

export type Declared = { mime: string; size: number; width: number; height: number };
export type Verified = { ok: true } | { ok: false; reason: "missing" | "mismatch" | "invalid" };

const firstRead = 64 * 1024;
const longRead = 512 * 1024;

/**
 * Checks an uploaded object against what the browser declared, using the object itself: it must exist, have the declared
 * size and stored Content-Type, and its first bytes must be a JPEG, PNG or WebP of the declared type whose pixel size
 * matches (or is turned 90 degrees from) the declared size.
 */
export async function verifyUploadedImage(key: string, declared: Declared): Promise<Verified> {
  const object = await statObject(key);
  if (!object.exists) return { ok: false, reason: "missing" };
  if (object.size !== declared.size || object.contentType !== declared.mime) return { ok: false, reason: "mismatch" };

  let read = readImageInfo(await readObjectPrefix(key, firstRead));
  if (!read.info && !read.complete && declared.size > firstRead) {
    read = readImageInfo(await readObjectPrefix(key, longRead));
  }
  if (!read.info) return { ok: false, reason: "invalid" };
  if (read.info.mime !== declared.mime) return { ok: false, reason: "mismatch" };
  if (!dimensionsInRange(read.info.width, read.info.height)) return { ok: false, reason: "invalid" };
  if (!dimensionsAgree(declared, read.info)) return { ok: false, reason: "mismatch" };
  return { ok: true };
}

type CommentWithMedia = { user_id: string; media?: MediaRow | null } & Record<string, unknown>;

/** Replaces a comment's `media` ({id, width, height, mime_type}) with a signed image ({id, width, height, url}), or null. */
export async function withSignedCommentImage<T extends CommentWithMedia>(comment: T) {
  const media = await signCommentImage(comment.user_id, comment.media);
  return { ...comment, media };
}
