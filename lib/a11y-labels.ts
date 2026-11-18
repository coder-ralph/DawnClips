/** Accessible names for the video controls. Kept in one place so the visible tooltip and the label never drift apart. */

export const playLabel = (playing: boolean) => (playing ? "Pause video" : "Play video");

/**
 * Describes the sound, not the action. Unmuted audio is only "playing" while the video itself is playing; with the
 * video paused it is simply on.
 */
export function audioLabel({ muted, volume, playing }: { muted: boolean; volume: number; playing: boolean }) {
  if (muted || volume === 0) return "Audio is muted";
  return playing ? "Audio is playing" : "Audio is on";
}

export const likeLabel = (liked: boolean) => (liked ? "Unlike video" : "Like video");

export function commentLikeLabel(liked: boolean) {
  return liked ? "Unlike comment" : "Like comment";
}
