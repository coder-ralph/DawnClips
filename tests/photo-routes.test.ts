import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * What the photo-post and comment-image routes, cleanup helpers and screens do, checked from their source (no browser,
 * Clerk, Supabase or R2 here). The behaviour of the database functions they call is in photo-posts-db.test.ts.
 */

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const before = (source: string, first: string, second: string) => {
  const a = source.indexOf(first);
  const b = source.indexOf(second);
  assert.ok(a >= 0, `missing: ${first}`);
  assert.ok(b >= 0, `missing: ${second}`);
  assert.ok(a < b, `${first} must come before ${second}`);
};

test("photo upload initiate: signed in, validated, rate limited, keys derived on the server, presigned PUT only", () => {
  const route = strip(read("app/api/posts/upload/initiate/route.ts"));
  before(route, "isAuthenticated", "postInitiateSchema.safeParse");
  before(route, "postInitiateSchema.safeParse", "consume_rate_limit");
  before(route, "consume_rate_limit", "await sweepStalePhotoPosts(");
  assert.match(route, /randomUUID\(\)/);
  assert.match(route, /postMediaKey\(ownerId, postId, id, file\.mimeType\)/);
  assert.match(route, /createUploadUrl\(image\.key as string, image\.file\.mimeType, image\.file\.size\)/);
  // The client sends sizes and types, never a key or an id; the owner comes from the signed-in profile.
  assert.doesNotMatch(route, /body\.(key|objectKey|id)\b|parsed\.data\.(key|objectKey|ownerId|userId)/);
  assert.match(route, /status: "pending"/);
  assert.match(route, /kind: "photo"/);
  assert.match(route, /\.rpc\("consume_rate_limit"/);
  assert.match(route, /status: 429/);
  // A failure while the rows are being made removes what was made.
  assert.match(route, /discardPhotoPost\(/);
});

test("photo upload complete: every object is read and checked before anything is published", () => {
  const route = strip(read("app/api/posts/upload/complete/route.ts"));
  before(route, "isAuthenticated", "postUploadCompleteSchema.safeParse");
  before(route, "postMediaKeys(ownerId, postId", "verifyUploadedImage(");
  before(route, "verifyUploadedImage(", 'update({ status: "published" })');
  assert.match(route, /\.eq\("user_id", ownerId\)/);
  assert.match(route, /\.eq\("kind", "photo"\)/);
  // A rejected file discards the whole post: objects first, then rows.
  assert.match(route, /if \(rejected\) \{\s*await discardPhotoPost\(admin, ownerId, postId\);/);
  assert.match(route, /status: 400/);
  // A photo that has not arrived yet is not an error to throw away: the post stays pending so the browser can finish.
  assert.match(route, /status: 409/);
});

test("photo upload cancel: only the owner's own unfinished photo post, objects deleted before it is marked removed", () => {
  const route = strip(read("app/api/posts/upload/cancel/route.ts"));
  assert.match(route, /\.eq\("user_id", profile\.profile\.id\)/);
  assert.match(route, /\.eq\("kind", "photo"\)/);
  assert.match(route, /discardPhotoPost\(admin, profile\.profile\.id, post\.data\.id as string, "removed"\)/);
  assert.match(route, /status: 502/);
});

test("cleanup helpers delete objects owner by owner with derived keys, and mark or remove rows only after that", () => {
  const source = strip(read("lib/media-cleanup.ts"));
  assert.match(source, /deleteObjects\(keys, ownerId\)/);
  assert.match(source, /postMediaKeys\(ownerId, postId/);
  assert.match(source, /commentImageKey\(row\.owner_id, row\.id, row\.mime_type\)/);
  const discard = source.slice(source.indexOf("export async function discardPhotoPost"), source.indexOf("export async function sweepStalePhotoPosts"));
  before(discard, "deleteMediaEntries(found.entries)", '.from("post_media").delete()');
  assert.match(discard, /if \(failed\.length > 0\) return false;/);
  assert.match(discard, /\.in\("status", \["pending", "processing"\]\)/, "a published post is never touched by a discard");
  const unattached = source.slice(source.indexOf("export async function discardUnattachedCommentImage"));
  assert.match(unattached, /status === "attached"\) return true/, "an attached image is left alone");
  before(unattached, "deleteMediaEntries(entries)", '.from("comment_media").delete()');
  // Abandoned work is swept the next time the person starts an upload.
  assert.match(source, /staleUploadMs = 6 \* 60 \* 60 \* 1000/);
  assert.match(source, /staleCommentImageMs = 60 \* 60 \* 1000/);
});

test("Update 13 protections stay: deletes are owner-bound, and only media-shaped keys are ever signed", () => {
  const r2 = strip(read("lib/r2.ts"));
  assert.match(r2, /isOwnedObjectKey\(/);
  const video = strip(read("lib/video.ts"));
  assert.match(video, /isOwnedMediaKey\(key, profileId\)/);
  const media = strip(read("lib/post-media.ts"));
  assert.match(media, /mediaKeyOwner\(key\) === null/);
  assert.match(media, /postMediaKey\(ownerId, postId, row\.id, row\.mime_type\)/);
  assert.match(media, /commentImageKey\(ownerId, media\.id, media\.mime_type\)/);
  assert.doesNotMatch(r2, /R2_PUBLIC_URL\s*\)\s*return\s*`/);
});

test("deleting a clip or photo post deletes its R2 objects and its comments' images before the database rows", () => {
  const route = strip(read("app/api/clips/[id]/route.ts"));
  before(route, "postImageEntries(admin, clip.data.user_id, clip.data.id)", "commentImagesOnClip(admin, clip.data.id)");
  before(route, "deleteMediaEntries(media)", ".delete()");
  assert.match(route, /status: 502/);
  assert.match(route, /clip\.data\.kind === "photo"/);
});

test("deleting an account also removes photo posts' images and every comment image it uploaded", () => {
  const source = strip(read("lib/deletion.ts"));
  assert.match(source, /from\("post_media"\)/);
  assert.match(source, /from\("comment_media"\)\.select\("id, mime_type"\)\.eq\("owner_id", profileId\)/);
  assert.match(source, /postMediaKeys\(profileId, postId, images\)/);
  assert.match(source, /commentImagesOnClip\(admin, clipId\)/);
  assert.match(source, /entry\.ownerId !== profileId/);
  assert.match(source, /deleteMediaEntries\(foreignImages\)/);
});

test("the video upload flow is unchanged except that it ignores photo posts and sweeps abandoned ones", () => {
  const initiate = strip(read("app/api/clips/upload/initiate/route.ts"));
  assert.match(initiate, /\.eq\("kind", "video"\)/);
  assert.match(initiate, /sweepStalePhotoPosts\(admin, profile\.profile\.id\)/);
  const complete = strip(read("app/api/clips/upload/complete/route.ts"));
  assert.doesNotMatch(complete, /post_media|photo/);
});

test("comment images: upload-first, verified from the stored bytes, attached through one database function", () => {
  const initiate = strip(read("app/api/comments/media/initiate/route.ts"));
  before(initiate, "isAuthenticated", "commentImageInitiateSchema.safeParse");
  before(initiate, "consume_rate_limit", "await sweepStaleCommentImages(");
  assert.match(initiate, /commentImageKey\(ownerId, id, parsed\.data\.mimeType\)/);
  assert.match(initiate, /createUploadUrl\(key, parsed\.data\.mimeType, parsed\.data\.size\)/);
  assert.match(initiate, />= 5/);

  const post = strip(read("app/api/clips/[id]/comments/route.ts"));
  before(post, "verifyUploadedImage(", '"add_comment_with_media"');
  assert.match(post, /\.eq\("owner_id", ownerId\)/);
  assert.match(post, /if \(!result\.ok\) \{[\s\S]*?discardUnattachedCommentImage\(admin, ownerId, mediaId\)/);
  assert.match(post, /withSignedCommentImage/);
  // Without an image the original function is used, so comments, replies and likes behave as before.
  assert.match(post, /callSocial\("add_comment", \{/);

  const cancel = strip(read("app/api/comments/media/[id]/route.ts"));
  assert.match(cancel, /\.eq\("owner_id", profile\.profile\.id\)/);
  assert.match(cancel, /status === "attached"\) return Response\.json\(\{ error: "That image is part of a comment\." \}, \{ status: 409 \}\)/);
});

test("the media route gives signed URLs only to someone allowed to see the post", () => {
  const route = strip(read("app/api/clips/[id]/media/route.ts"));
  assert.match(route, /authorize_clip_playback/);
  assert.match(route, /row\.kind !== "photo"/);
  assert.match(route, /row\.status !== "published"/);
  assert.match(route, /signPostImages\(row\.user_id, row\.id/);
});

test("the New clip button opens a chooser; Post a Clip is the existing composer, Post Photos is the new one", () => {
  const events = strip(read("lib/ui-events.ts"));
  assert.match(events, /OPEN_UPLOAD_EVENT = "dawnclips:open-upload"/);
  assert.match(events, /OPEN_CLIP_COMPOSER_EVENT/);
  assert.match(events, /OPEN_PHOTO_COMPOSER_EVENT/);
  const chooser = strip(read("components/upload/publish-chooser.tsx"));
  assert.match(chooser, /addEventListener\(OPEN_UPLOAD_EVENT/);
  assert.match(chooser, /Post a Clip/);
  assert.match(chooser, /Post Photos/);
  const modal = strip(read("components/upload/upload-modal.tsx"));
  assert.match(modal, /addEventListener\(OPEN_CLIP_COMPOSER_EVENT/);
  assert.doesNotMatch(modal, /OPEN_UPLOAD_EVENT/);
  const shell = strip(read("components/layout/app-shell.tsx"));
  assert.match(shell, /<PublishChooser \/>/);
  assert.match(shell, /<PhotoComposer /);
});

test("the photo composer: up to 20 JPEG/PNG/WebP, previews, reorder, remove, progress, failure and cancel", () => {
  const source = strip(read("components/upload/photo-composer.tsx"));
  assert.match(source, /accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(source, /multiple/);
  assert.match(source, /PHOTO_POST_MAX_IMAGES/);
  assert.match(source, /prepareImage\(file, photoPrepare\)/);
  assert.match(source, /URL\.createObjectURL/);
  assert.match(source, /URL\.revokeObjectURL/);
  assert.match(source, /Move photo \$\{index \+ 1\} earlier/);
  assert.match(source, /Move photo \$\{index \+ 1\} later/);
  assert.match(source, /Remove photo \$\{index \+ 1\}/);
  assert.match(source, /role="progressbar"/);
  assert.match(source, /new XMLHttpRequest\(\)/);
  assert.match(source, /request\.upload\.onprogress/);
  // Every failure path asks the server to delete what was uploaded; a retry starts a new post.
  assert.match(source, /\/api\/posts\/upload\/cancel/);
  assert.match(source, /if \(startedId\) await cancelPost\(startedId\)/);
  assert.match(source, /Nothing was posted/);
  assert.match(source, /"Retry"/);
  assert.match(source, /beforeunload/);
  // The caption is optional and the visibility options are the existing ones.
  assert.match(source, /Add a caption \(optional\)/);
  assert.match(source, /public: \{[^}]*\},\s*unlisted: \{[^}]*\},\s*private: \{/);
});

test("feed cards, grids and the viewer treat photo posts as photo posts", () => {
  const card = strip(read("components/feed/clip-card.tsx"));
  assert.match(card, /clip\.kind === "photo"/);
  assert.match(card, /carouselRatio\(cover\.width, cover\.height\)/);
  assert.match(card, /data-testid="carousel-indicator"/);
  const viewer = strip(read("components/clip/clip-viewer.tsx"));
  assert.match(viewer, /<PostMedia postId=\{clip\.id\}/);
  assert.match(viewer, /aria-label=\{photo \? "Close post" : "Close video"\}/);
  const menu = strip(read("components/feed/clip-menu.tsx"));
  assert.match(menu, /isPublic && !photo/);
  const content = strip(read("components/clip/clip-viewer-content.tsx"));
  assert.match(content, /clip\.kind === "video"/);
  const embed = strip(read("lib/clips.ts"));
  assert.match(embed, /row\.kind === "photo"\) return null/, "photo posts are never embedded");
});

test("profile tabs are Highlights, Posts, Liked and Comments, with Posts gated by its own switch", () => {
  const tabs = strip(read("components/profile/profile-tabs.tsx"));
  assert.match(tabs, /\["highlights", "posts", "liked", "comments"\]/);
  const page = strip(read("app/(main)/profile/[id]/page.tsx"));
  assert.match(page, /!profile\.showPosts && !profile\.isOwn \? "posts" : null/);
  assert.match(page, /tab === "highlights" \|\| tab === "posts" \|\| tab === "liked"/);
  const stats = strip(read("components/profile/profile-stats.tsx"));
  assert.match(stats, /profile\.postsCount/);
  const settings = strip(read("components/settings/preferences-form.tsx"));
  assert.match(settings, /name="showPosts"/);
  const action = strip(read("app/(main)/settings/preferences-action.ts"));
  assert.match(action, /show_posts: flagValue\(input\.showPosts\)/);
});

test("comment images show in the comment, open larger, fall back when missing, and can be removed before posting", () => {
  const section = strip(read("components/social/comment-section.tsx"));
  assert.match(section, /<ImageLightbox/);
  assert.match(section, /This photo is not available\./);
  assert.match(section, /\/api\/comments\/media\/initiate/);
  assert.match(section, /mediaId: attached\.mediaId/);
  assert.match(section, /method: "DELETE"/);
  const lightbox = strip(read("components/ui/image-lightbox.tsx"));
  assert.match(lightbox, /showModal\(\)/);
  assert.match(lightbox, /aria-label="Close photo"/);
});

test("phase 15 changes no existing table except additive columns and the two relaxed constraints", () => {
  const sql = read("supabase/schema-phase15.sql");
  const alters = [...sql.matchAll(/^alter table public\.(\w+) (add column|drop constraint|add constraint|enable row level security)/gim)].map((m) => `${m[1]} ${m[2].toLowerCase()}`);
  const tables = new Set(alters.map((entry) => entry.split(" ")[0]));
  assert.deepEqual([...tables].sort(), ["clips", "comment_media", "comments", "post_media", "profile_settings"]);
  assert.doesNotMatch(sql, /drop table|truncate|delete from public\.(clips|comments|profiles)/i);
  assert.match(sql, /alter table public\.post_media enable row level security/);
  assert.match(sql, /alter table public\.comment_media enable row level security/);
  assert.match(sql, /revoke all on public\.post_media from anon, authenticated/);
  assert.match(sql, /revoke all on public\.comment_media from anon, authenticated/);
  assert.match(sql, /create index if not exists/);
  const schema = read("supabase/schema.sql");
  assert.ok(schema.trimEnd().endsWith(sql.trimEnd()));
});
