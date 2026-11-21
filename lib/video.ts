import { isOwnedMediaKey } from "@/lib/media";

const objectKeyPattern =
  /^clips\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(mp4|jpg)$/;

export function isMp4Signature(bytes: Uint8Array) {
  if (bytes.length < 8) return false;
  return String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]) === "ftyp";
}

/** True when the key has the generated `clips/<profile>/<clip>.mp4|jpg` shape. It says nothing about who owns it. */
export function hasClipObjectKeyShape(key: string) {
  return objectKeyPattern.test(key);
}

/**
 * True when `key` is one of this profile's own objects: a clip (`clips/<profile>/<clip>.mp4|jpg`), a photo-post image or
 * a comment image (lib/media.ts). Every shape is strict and carries the owner's profile id, so a key under another
 * profile, or any other path, is never owned.
 */
export function isOwnedObjectKey(key: string, profileId: string) {
  const match = objectKeyPattern.exec(key);
  if (match) return match[1] === profileId;
  return isOwnedMediaKey(key, profileId);
}

export function clipObjectKey(profileId: string, clipId: string, ext: "mp4" | "jpg") {
  return `clips/${profileId}/${clipId}.${ext}`;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * The only object keys a clip may use, derived from the clip's owner (profile id) and its own id.
 * Stored keys are never trusted on their own: they must equal these before they are signed, served or deleted.
 */
export function clipStorageKeys(ownerId: unknown, clipId: unknown) {
  if (typeof ownerId !== "string" || typeof clipId !== "string") return null;
  if (!uuidPattern.test(ownerId) || !uuidPattern.test(clipId)) return null;
  return { video: clipObjectKey(ownerId, clipId, "mp4"), poster: clipObjectKey(ownerId, clipId, "jpg") };
}

/**
 * Checks the stored keys of a clip against the keys derived from its owner and id.
 * `video` is null when the stored video key is missing or is not the clip's own key, and the clip must not be served.
 * A stored poster key that is not the clip's own is dropped (`posterRejected`) instead of being signed.
 */
export function resolveClipKeys(clip: { id: unknown; ownerId: unknown; videoKey: unknown; posterKey?: unknown }) {
  const derived = clipStorageKeys(clip.ownerId, clip.id);
  const video = derived && clip.videoKey === derived.video ? derived.video : null;
  const hasPoster = typeof clip.posterKey === "string" && clip.posterKey.length > 0;
  const poster = derived && hasPoster && clip.posterKey === derived.poster ? derived.poster : null;
  return { video, poster, videoRejected: video === null, posterRejected: hasPoster && poster === null };
}

/**
 * Splits keys read from a clip row into the ones that belong to that clip (to act on) and the rest (never to touch).
 */
export function splitClipKeys(clip: { id: unknown; ownerId: unknown }, keys: Array<string | null | undefined>) {
  const derived = clipStorageKeys(clip.ownerId, clip.id);
  const own: string[] = [];
  const foreign: string[] = [];
  for (const key of keys) {
    if (!key) continue;
    if (derived && (key === derived.video || key === derived.poster)) own.push(key);
    else foreign.push(key);
  }
  return { own, foreign };
}

export function maxClipBytes() {
  const raw = Number(process.env.CLIP_MAX_BYTES ?? 104_857_600);
  if (!Number.isFinite(raw) || raw < 1_048_576) return 104_857_600;
  return Math.min(raw, 104_857_600);
}

export function formatDuration(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
}

export function formatCount(value: number) {
  return new Intl.NumberFormat("en", { notation: value > 9999 ? "compact" : "standard" }).format(value);
}

export function formatRelativeTime(value: string) {
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value));
}
