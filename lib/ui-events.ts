/** Tiny browser events so server-rendered chrome can open client-owned UI. */
/** The New clip button and the /upload page: opens the "Post a Clip / Post Photos" chooser. */
export const OPEN_UPLOAD_EVENT = "dawnclips:open-upload";
/** Opened by the chooser: the video composer (unchanged) and the photo composer. */
export const OPEN_CLIP_COMPOSER_EVENT = "dawnclips:open-clip-composer";
export const OPEN_PHOTO_COMPOSER_EVENT = "dawnclips:open-photo-composer";
export const CLIP_PUBLISHED_EVENT = "dawnclips:clip-published";
export const CLIP_CHANGED_EVENT = "dawnclips:clip-changed";

export function openUploadModal() {
  window.dispatchEvent(new Event(OPEN_UPLOAD_EVENT));
}
