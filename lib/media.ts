/**
 * Photo posts and comment images: limits, the object keys they live under, and the checks that stop a key from ever
 * pointing at somebody else's object. Shared by the browser (limits, file checks) and the server (keys).
 *
 * Keys are never read from the client or trusted as stored. They are derived from the owner's profile id and
 * server-generated ids, the same rule Phase 10 set for clips:
 *
 *   posts/<owner>/<post>/<image>.<jpg|png|webp>      the images of a photo post
 *   comment-images/<owner>/<image>.<jpg|png|webp>    the image of a comment
 *
 * Clip keys (`clips/<owner>/<clip>.mp4|jpg`) are unchanged and are handled by lib/video.ts.
 */

export const imageMimeTypes = ["image/jpeg", "image/png", "image/webp"] as const;
export type ImageMime = (typeof imageMimeTypes)[number];

/** A photo post holds up to 20 images. */
export const PHOTO_POST_MAX_IMAGES = 20;
/** Largest single photo, matching the video limit. */
export const PHOTO_MAX_BYTES = 104_857_600;
/** Sanity cap on all the photos of one post together (20 x 100 MB is far more than anyone posts). */
export const PHOTO_POST_MAX_TOTAL_BYTES = 524_288_000;
/** Largest image attached to a comment. */
export const COMMENT_IMAGE_MAX_BYTES = 5_242_880;
/** Longest side the database accepts (post_media / comment_media check constraints). */
export const IMAGE_MAX_SIDE = 16_384;
/** Decoded size limit (width x height), so a small file cannot expand into a huge bitmap in someone's browser. */
export const IMAGE_MAX_PIXELS = 120_000_000;

const extByMime: Record<ImageMime, "jpg" | "png" | "webp"> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const postKeyPattern = new RegExp(`^posts/(${uuid})/(${uuid})/(${uuid})\\.(jpg|png|webp)$`);
const commentKeyPattern = new RegExp(`^comment-images/(${uuid})/(${uuid})\\.(jpg|png|webp)$`);

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}

export function isImageMime(value: unknown): value is ImageMime {
  return typeof value === "string" && (imageMimeTypes as readonly string[]).includes(value);
}

export function imageExtension(mime: string) {
  return isImageMime(mime) ? extByMime[mime] : null;
}

export function postMediaKey(ownerId: unknown, postId: unknown, mediaId: unknown, mime: unknown) {
  if (!isUuid(ownerId) || !isUuid(postId) || !isUuid(mediaId) || !isImageMime(mime)) return null;
  return `posts/${ownerId}/${postId}/${mediaId}.${extByMime[mime]}`;
}

export function commentImageKey(ownerId: unknown, mediaId: unknown, mime: unknown) {
  if (!isUuid(ownerId) || !isUuid(mediaId) || !isImageMime(mime)) return null;
  return `comment-images/${ownerId}/${mediaId}.${extByMime[mime]}`;
}

/** The profile id a photo-post or comment-image key is filed under, or null when the key is not of either shape. */
export function mediaKeyOwner(key: string) {
  const post = postKeyPattern.exec(key);
  if (post) return post[1];
  const comment = commentKeyPattern.exec(key);
  return comment ? comment[1] : null;
}

/** True when `key` has a photo-post or comment-image shape AND is filed under `profileId`. */
export function isOwnedMediaKey(key: string, profileId: string) {
  const owner = mediaKeyOwner(key);
  return owner !== null && owner === profileId;
}

export type MediaRef = { id: string; mimeType: string };

/**
 * The keys of a post's images, derived from the post's owner and id. A row with a malformed id or type is skipped and
 * counted in `invalid`, so callers can refuse to act instead of deleting or signing something unexpected.
 */
export function postMediaKeys(ownerId: unknown, postId: unknown, media: MediaRef[]) {
  const keys: Array<{ id: string; key: string }> = [];
  let invalid = 0;
  for (const item of media) {
    const key = postMediaKey(ownerId, postId, item.id, item.mimeType);
    if (key) keys.push({ id: item.id, key });
    else invalid += 1;
  }
  return { keys, invalid };
}

/** Browser check before anything is uploaded: type by file name and declared type, and size. The server checks again. */
export function checkImageFile(file: { name: string; type: string; size: number }, maxBytes: number): string | null {
  if (!isImageMime(file.type)) return "Only JPEG, PNG and WebP images are accepted.";
  if (!/\.(jpe?g|png|webp)$/i.test(file.name)) return "Only JPEG, PNG and WebP images are accepted.";
  if (file.size <= 0) return "That file is empty.";
  if (file.size > maxBytes) return `Images must be ${Math.round(maxBytes / 1_048_576)} MB or smaller.`;
  return null;
}

/** Declared pixel size against the size read from the file: equal, or swapped (a phone photo that carries an EXIF turn). */
export function dimensionsAgree(declared: { width: number; height: number }, actual: { width: number; height: number }) {
  return (
    (declared.width === actual.width && declared.height === actual.height) ||
    (declared.width === actual.height && declared.height === actual.width)
  );
}

export function dimensionsInRange(width: number, height: number) {
  return (
    Number.isInteger(width) &&
    Number.isInteger(height) &&
    width >= 1 &&
    height >= 1 &&
    width <= IMAGE_MAX_SIDE &&
    height <= IMAGE_MAX_SIDE &&
    width * height <= IMAGE_MAX_PIXELS
  );
}
