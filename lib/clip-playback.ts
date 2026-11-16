import "server-only";
import type { Playback } from "@/lib/playback-cache";
import { createPlaybackUrl, publicObjectUrl } from "@/lib/r2";
import { resolveClipKeys } from "@/lib/video";

export type ClipPlayback = Playback;

/** The fields of `authorize_clip_playback` that decide what may be played. */
export type AuthorizedClipRow = {
  id?: string;
  user_id?: string;
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

  // Stored keys are only signed when they are exactly the keys derived from the clip's owner and id. A row that
  // points at another user's object (for example a hand-edited thumbnail_object_key) never reaches the signer.
  const keys = resolveClipKeys({ id: clip.id, ownerId: clip.user_id, videoKey: clip.object_key, posterKey: clip.thumbnail_key });
  if (!keys.video) {
    console.error(`Playback refused: the stored video key of clip ${String(clip.id)} does not match its owner and id.`);
    return null;
  }
  if (keys.posterRejected) console.error(`Playback: ignored a poster key of clip ${String(clip.id)} that does not match its owner and id.`);

  const isPublic = clip.visibility === "public";
  const thumbnailKey = keys.poster;

  const publicVideo = isPublic ? publicObjectUrl(keys.video) : null;
  const publicPoster = isPublic && thumbnailKey ? publicObjectUrl(thumbnailKey) : null;

  const [video, poster] = await Promise.all([
    publicVideo
      ? Promise.resolve({ url: publicVideo, expiresAt: null as string | null })
      : createPlaybackUrl(keys.video, options),
    publicPoster
      ? Promise.resolve({ url: publicPoster })
      : thumbnailKey
        ? createPlaybackUrl(thumbnailKey, options)
        : Promise.resolve(null),
  ]);
  return { url: video.url, expiresAt: video.expiresAt, poster: poster?.url ?? null };
}
