/** What a player needs to start a clip: the video URL, when it stops working (null if it never does) and a poster. */
export type Playback = { url: string; expiresAt: string | null; poster: string | null };

export type PlaybackResult = { playback: Playback } | { error: "unavailable" | "network" };

/** A URL this close to expiring is treated as expired, so a clip never starts with a URL that dies mid-play. */
const expiryMarginMs = 60_000;
const maxEntries = 80;

const store = new Map<string, Playback>();
const inflight = new Map<string, Promise<PlaybackResult>>();

const usable = (playback: Playback) =>
  !playback.expiresAt || new Date(playback.expiresAt).getTime() - Date.now() > expiryMarginMs;

/** A playback entry this tab already holds for the clip (from the feed, the viewer page or an earlier request). */
export function getCachedPlayback(clipId: string) {
  const hit = store.get(clipId);
  return hit && usable(hit) ? hit : null;
}

export function rememberPlayback(clipId: string, playback: Playback) {
  store.delete(clipId);
  store.set(clipId, playback);
  if (store.size > maxEntries) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }
}

export function forgetPlayback(clipId: string) {
  store.delete(clipId);
}

async function request(clipId: string, fresh: boolean): Promise<PlaybackResult> {
  try {
    const response = await fetch(`/api/clips/${clipId}/playback${fresh ? "?fresh=1" : ""}`);
    if (!response.ok) return { error: "unavailable" };
    const playback = (await response.json()) as Playback;
    rememberPlayback(clipId, playback);
    return { playback };
  } catch {
    return { error: "network" };
  }
}

/**
 * Playback URLs for a clip. Answered from memory when this tab already has a usable one, and one request is shared
 * by everything asking at the same time (a feed card and the viewer opened from it, for example).
 * `fresh` skips the cache and asks the server to sign at the exact current time; the player uses it after a failure.
 */
export function fetchPlayback(clipId: string, fresh = false): Promise<PlaybackResult> {
  if (!fresh) {
    const hit = getCachedPlayback(clipId);
    if (hit) return Promise.resolve({ playback: hit });
  }
  const key = `${clipId}:${fresh ? "fresh" : "normal"}`;
  let pending = inflight.get(key);
  if (!pending) {
    pending = request(clipId, fresh).finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }
  return pending;
}

const warming = new Map<string, HTMLVideoElement>();

/**
 * Starts downloading a video before the player that needs it exists. The feed calls it the moment a clip is opened,
 * so the bytes arrive while the viewer page is still rendering on the server. The element is dropped after a while.
 */
export function warmVideo(url: string) {
  if (typeof document === "undefined" || warming.has(url)) return;
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.src = url;
  warming.set(url, video);
  window.setTimeout(() => {
    video.removeAttribute("src");
    video.load();
    warming.delete(url);
  }, 20_000);
}
