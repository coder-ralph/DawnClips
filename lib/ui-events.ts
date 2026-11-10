/** Tiny browser events so server-rendered chrome can open client-owned UI. */
export const OPEN_UPLOAD_EVENT = "dawnclips:open-upload";
export const CLIP_PUBLISHED_EVENT = "dawnclips:clip-published";
export const CLIP_CHANGED_EVENT = "dawnclips:clip-changed";

export function openUploadModal() {
  window.dispatchEvent(new Event(OPEN_UPLOAD_EVENT));
}
