const objectKeyPattern =
  /^clips\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(mp4|jpg)$/;

export function isMp4Signature(bytes: Uint8Array) {
  if (bytes.length < 8) return false;
  return String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]) === "ftyp";
}

export function isOwnedObjectKey(key: string, profileId: string) {
  const match = objectKeyPattern.exec(key);
  return Boolean(match && match[1] === profileId);
}

export function clipObjectKey(profileId: string, clipId: string, ext: "mp4" | "jpg") {
  return `clips/${profileId}/${clipId}.${ext}`;
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
