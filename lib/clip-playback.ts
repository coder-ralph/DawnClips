import "server-only";
import type { Playback } from "@/lib/playback-cache";
import { createPlaybackUrl, publicObjectUrl } from "@/lib/r2";

export type ClipPlayback = Playback;

/** The fields of `authorize_clip_playback` that decide what may be played. */
export type AuthorizedClipRow = {
  object_key?: string;
  visibility?: string;
  status?: string;
  thumbnail_key?: string | null;
};

/**
 * Turns an already-authorised clip row into playback URLs. The playback API and the clip page share this, so
 * both apply the same rule: public clips use the stable public URL, everything else gets a short-lived signed URL.
 * The caller must have run `authorize_clip_playback` for the current viewer first.
 */
export async function buildClipPlayback(
  clip: AuthorizedClipRow,
  options: { fresh?: boolean } = {},
): Promise<ClipPlayback | null> {
  if (clip.status !== "published" || !clip.object_key) return null;
  const isPublic = clip.visibility === "public";
  const thumbnailKey = clip.thumbnail_key ?? null;

  const publicVideo = isPublic ? publicObjectUrl(clip.object_key) : null;
  const publicPoster = isPublic && thumbnailKey ? publicObjectUrl(thumbnailKey) : null;

  const [video, poster] = await Promise.all([
    publicVideo
      ? Promise.resolve({ url: publicVideo, expiresAt: null as string | null })
      : createPlaybackUrl(clip.object_key, options),
    publicPoster
      ? Promise.resolve({ url: publicPoster })
      : thumbnailKey
        ? createPlaybackUrl(thumbnailKey, options)
        : Promise.resolve(null),
  ]);
  return { url: video.url, expiresAt: video.expiresAt, poster: poster?.url ?? null };
}
