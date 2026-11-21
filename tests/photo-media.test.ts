import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { carouselRatio, CAROUSEL_MAX_RATIO, CAROUSEL_MIN_RATIO } from "../lib/carousel";
import { readImageInfo } from "../lib/image-meta";
import { isAnimatedImage, planImagePrep, commentImagePrepare, photoPrepare } from "../lib/image-prepare";
import {
  checkImageFile,
  COMMENT_IMAGE_MAX_BYTES,
  commentImageKey,
  dimensionsAgree,
  dimensionsInRange,
  isOwnedMediaKey,
  mediaKeyOwner,
  PHOTO_MAX_BYTES,
  PHOTO_POST_MAX_IMAGES,
  PHOTO_POST_MAX_TOTAL_BYTES,
  postMediaKey,
  postMediaKeys,
} from "../lib/media";
import { clipObjectKey, isOwnedObjectKey } from "../lib/video";
import { commentImageInitiateSchema, postInitiateSchema } from "../lib/validations/post";
import { commentBodySchema } from "../lib/validations/social";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// ---------------------------------------------------------------------------
// Real file headers
// ---------------------------------------------------------------------------

const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const text = (value: string) => [...value].map((c) => c.charCodeAt(0));
const png = (w: number, h: number, extra: number[] = []) =>
  new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...be32(13), ...text("IHDR"), ...be32(w), ...be32(h), 8, 6, 0, 0, 0, 0, 0, 0, 0, ...extra]);
const jpeg = (w: number, h: number, pad = 0) =>
  new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...text("JFIF"), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, ...(pad ? [0xff, 0xe1, (pad + 2) >> 8, (pad + 2) & 255, ...Array(pad).fill(0)] : []), 0xff, 0xc0, 0x00, 0x11, 8, h >> 8, h & 255, w >> 8, w & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
const le32 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
const webpLossy = (w: number, h: number) =>
  new Uint8Array([...text("RIFF"), ...le32(40), ...text("WEBP"), ...text("VP8 "), ...le32(20), 0x30, 0x01, 0x00, 0x9d, 0x01, 0x2a, w & 255, w >> 8, h & 255, h >> 8, ...Array(10).fill(0)]);
const webpLossless = (w: number, h: number) => {
  const bits = (w - 1) | ((h - 1) << 14);
  return new Uint8Array([...text("RIFF"), ...le32(40), ...text("WEBP"), ...text("VP8L"), ...le32(20), 0x2f, ...le32(bits), ...Array(15).fill(0)]);
};
const webpExtended = (w: number, h: number, flags = 0) =>
  new Uint8Array([...text("RIFF"), ...le32(40), ...text("WEBP"), ...text("VP8X"), ...le32(10), flags, 0, 0, 0, (w - 1) & 255, ((w - 1) >> 8) & 255, ((w - 1) >> 16) & 255, (h - 1) & 255, ((h - 1) >> 8) & 255, ((h - 1) >> 16) & 255, ...Array(10).fill(0)]);

test("the real file header decides the type and pixel size, whatever the name or Content-Type says", () => {
  assert.deepEqual(readImageInfo(png(1080, 1350)).info, { mime: "image/png", width: 1080, height: 1350 });
  assert.deepEqual(readImageInfo(jpeg(1920, 1080)).info, { mime: "image/jpeg", width: 1920, height: 1080 });
  assert.deepEqual(readImageInfo(webpLossy(800, 1200)).info, { mime: "image/webp", width: 800, height: 1200 });
  assert.deepEqual(readImageInfo(webpLossless(1000, 563)).info, { mime: "image/webp", width: 1000, height: 563 });
  assert.deepEqual(readImageInfo(webpExtended(4000, 3000)).info, { mime: "image/webp", width: 4000, height: 3000 });
});

test("things that are not JPEG, PNG or WebP are refused whatever they pretend to be", () => {
  const gif = new Uint8Array([...text("GIF89a"), 1, 0, 1, 0, 0, 0, 0, 0]);
  const svg = new Uint8Array(text('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>'));
  const html = new Uint8Array(text("<!doctype html><script>alert(1)</script>"));
  const mp4 = new Uint8Array([0, 0, 0, 24, ...text("ftypisom"), 0, 0, 2, 0, ...text("isomiso2")]);
  const empty = new Uint8Array(0);
  const riffWav = new Uint8Array([...text("RIFF"), ...le32(40), ...text("WAVE"), ...text("fmt "), ...Array(20).fill(0)]);
  for (const bytes of [gif, svg, html, mp4, empty, riffWav]) assert.equal(readImageInfo(bytes).info, null);
  // A PNG signature with no IHDR, and a JPEG that ends before a size marker, are not images either.
  const brokenPng = png(10, 10);
  brokenPng.set(text("XXXX"), 12);
  assert.equal(readImageInfo(brokenPng).info, null);
  assert.equal(readImageInfo(new Uint8Array([0xff, 0xd8, 0xff, 0xd9])).info, null);
});

test("a JPEG whose size marker lies past a long header asks for more bytes instead of failing", () => {
  const long = jpeg(640, 480, 300);
  const first = readImageInfo(long.slice(0, 100));
  assert.equal(first.info, null);
  assert.equal(first.complete, false);
  assert.deepEqual(readImageInfo(long).info, { mime: "image/jpeg", width: 640, height: 480 });
});

test("declared and real sizes must agree, or be turned a quarter (an EXIF-rotated phone photo)", () => {
  assert.equal(dimensionsAgree({ width: 4032, height: 3024 }, { width: 4032, height: 3024 }), true);
  assert.equal(dimensionsAgree({ width: 3024, height: 4032 }, { width: 4032, height: 3024 }), true);
  assert.equal(dimensionsAgree({ width: 1000, height: 1000 }, { width: 4032, height: 3024 }), false);
  assert.equal(dimensionsInRange(1, 1), true);
  assert.equal(dimensionsInRange(16384, 7324), true);
  assert.equal(dimensionsInRange(16384, 7325), false, "more than 120 megapixels");
  assert.equal(dimensionsInRange(16385, 10), false);
  assert.equal(dimensionsInRange(0, 10), false);
  assert.equal(dimensionsInRange(10.5, 10), false);
});

// ---------------------------------------------------------------------------
// Limits and file checks
// ---------------------------------------------------------------------------

test("limits: 20 photos of up to 100 MB, one comment image of up to 5 MB", () => {
  assert.equal(PHOTO_POST_MAX_IMAGES, 20);
  assert.equal(PHOTO_MAX_BYTES, 100 * 1024 * 1024);
  assert.equal(COMMENT_IMAGE_MAX_BYTES, 5 * 1024 * 1024);
  assert.ok(PHOTO_POST_MAX_TOTAL_BYTES >= PHOTO_MAX_BYTES);
});

test("the browser check accepts JPEG, PNG and WebP by type and name, and refuses the rest", () => {
  const ok = (name: string, type: string, size = 1000) => checkImageFile({ name, type, size }, PHOTO_MAX_BYTES);
  assert.equal(ok("a.jpg", "image/jpeg"), null);
  assert.equal(ok("a.JPEG", "image/jpeg"), null);
  assert.equal(ok("a.png", "image/png"), null);
  assert.equal(ok("a.webp", "image/webp"), null);
  assert.match(ok("a.gif", "image/gif") ?? "", /JPEG, PNG and WebP/);
  assert.match(ok("a.svg", "image/svg+xml") ?? "", /JPEG, PNG and WebP/);
  assert.match(ok("a.jpg", "video/mp4") ?? "", /JPEG, PNG and WebP/);
  assert.match(ok("a.mp4", "image/jpeg") ?? "", /JPEG, PNG and WebP/, "a name that does not match the type");
  assert.match(ok("a.jpg", "image/jpeg", 0) ?? "", /empty/);
  assert.match(ok("a.jpg", "image/jpeg", PHOTO_MAX_BYTES + 1) ?? "", /100 MB/);
  assert.equal(ok("a.jpg", "image/jpeg", PHOTO_MAX_BYTES), null);
  assert.match(checkImageFile({ name: "a.jpg", type: "image/jpeg", size: COMMENT_IMAGE_MAX_BYTES + 1 }, COMMENT_IMAGE_MAX_BYTES) ?? "", /5 MB/);
});

test("the post request schema: 1 to 20 images, valid types, sizes and pixel sizes", () => {
  const file = { mimeType: "image/jpeg", size: 2_000_000, width: 1080, height: 1350 };
  const post = (files: unknown[], extra: Record<string, unknown> = {}) => postInitiateSchema.safeParse({ caption: "hello", files, ...extra });
  assert.equal(post([file]).success, true);
  assert.equal(post(Array.from({ length: 20 }, () => file)).success, true);
  assert.equal(post(Array.from({ length: 21 }, () => file)).success, false, "21 photos");
  assert.equal(post([]).success, false, "no photos");
  assert.equal(post([{ ...file, mimeType: "image/gif" }]).success, false);
  assert.equal(post([{ ...file, mimeType: "image/svg+xml" }]).success, false);
  assert.equal(post([{ ...file, mimeType: "video/mp4" }]).success, false);
  assert.equal(post([{ ...file, size: PHOTO_MAX_BYTES + 1 }]).success, false);
  assert.equal(post([{ ...file, size: PHOTO_MAX_BYTES }]).success, true);
  assert.equal(post([{ ...file, size: 0 }]).success, false);
  assert.equal(post([{ ...file, width: 0 }]).success, false);
  assert.equal(post([{ ...file, height: 16385 }]).success, false);
  assert.equal(post([file], { caption: "x".repeat(1001) }).success, false);
  assert.equal(post([file], { visibility: "everyone" }).success, false);
  const parsed = postInitiateSchema.parse({ files: [file] });
  assert.equal(parsed.visibility, "public");
  assert.equal(parsed.caption, "");
  // 20 x 100 MB is more than the 500 MB a single post may total.
  assert.equal(post(Array.from({ length: 20 }, () => ({ ...file, size: PHOTO_MAX_BYTES }))).success, false);
});

test("the comment image schema: one image of up to 5 MB, JPEG, PNG or WebP", () => {
  const image = { mimeType: "image/png", size: 1_000_000, width: 800, height: 600 };
  assert.equal(commentImageInitiateSchema.safeParse(image).success, true);
  assert.equal(commentImageInitiateSchema.safeParse({ ...image, size: COMMENT_IMAGE_MAX_BYTES }).success, true);
  assert.equal(commentImageInitiateSchema.safeParse({ ...image, size: COMMENT_IMAGE_MAX_BYTES + 1 }).success, false);
  assert.equal(commentImageInitiateSchema.safeParse({ ...image, mimeType: "image/gif" }).success, false);
  assert.equal(commentImageInitiateSchema.safeParse({ ...image, mimeType: "text/html" }).success, false);
  assert.equal(commentImageInitiateSchema.safeParse({ ...image, key: "comment-images/x/y.png" }).success, true, "an extra key is ignored, never used");
  assert.equal("key" in commentImageInitiateSchema.parse({ ...image, key: "comment-images/x/y.png" }), false);
});

test("a comment needs text or an image, and the text stays within 500", () => {
  const mediaId = randomUUID();
  assert.equal(commentBodySchema.safeParse({ content: "hi" }).success, true);
  assert.equal(commentBodySchema.safeParse({ content: "" }).success, false);
  assert.equal(commentBodySchema.safeParse({ content: "   " }).success, false);
  assert.equal(commentBodySchema.safeParse({ content: "", mediaId }).success, true);
  assert.equal(commentBodySchema.safeParse({ mediaId }).success, true);
  assert.equal(commentBodySchema.safeParse({ content: "x".repeat(500) }).success, true);
  assert.equal(commentBodySchema.safeParse({ content: "x".repeat(501) }).success, false);
  assert.equal(commentBodySchema.safeParse({ content: "hi", mediaId: "../../clips/other" }).success, false);
});

// ---------------------------------------------------------------------------
// Object keys (Update 13 rules extended to the new prefixes)
// ---------------------------------------------------------------------------

test("keys are built from server ids, in their own prefixes, and the clips/ keys are unchanged", () => {
  const [owner, post, image] = [randomUUID(), randomUUID(), randomUUID()];
  assert.equal(postMediaKey(owner, post, image, "image/webp"), `posts/${owner}/${post}/${image}.webp`);
  assert.equal(postMediaKey(owner, post, image, "image/jpeg"), `posts/${owner}/${post}/${image}.jpg`);
  assert.equal(postMediaKey(owner, post, image, "image/png"), `posts/${owner}/${post}/${image}.png`);
  assert.equal(commentImageKey(owner, image, "image/png"), `comment-images/${owner}/${image}.png`);
  assert.equal(clipObjectKey(owner, post, "mp4"), `clips/${owner}/${post}.mp4`);
  assert.equal(clipObjectKey(owner, post, "jpg"), `clips/${owner}/${post}.jpg`);
});

test("a key is never built from a path, a type that is not an image, or an id that is not a UUID", () => {
  const [owner, post, image] = [randomUUID(), randomUUID(), randomUUID()];
  assert.equal(postMediaKey("../x", post, image, "image/png"), null);
  assert.equal(postMediaKey(owner, `${post}/../..`, image, "image/png"), null);
  assert.equal(postMediaKey(owner, post, `${image}.png`, "image/png"), null);
  assert.equal(postMediaKey(owner, post, image, "image/gif"), null);
  assert.equal(postMediaKey(owner, post, image, "video/mp4"), null);
  assert.equal(commentImageKey(owner, "not-a-uuid", "image/png"), null);
  assert.equal(commentImageKey(owner, image, "text/html"), null);
  assert.equal(postMediaKey(owner.toUpperCase(), post, image, "image/png"), null, "ids are lower-case UUIDs");
});

test("an object can only be deleted by its owner: media keys and clip keys share one ownership check", () => {
  const [owner, other, post, image] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
  const keys = [postMediaKey(owner, post, image, "image/webp")!, commentImageKey(owner, image, "image/jpeg")!, clipObjectKey(owner, post, "mp4")];
  for (const key of keys) {
    assert.equal(isOwnedObjectKey(key, owner), true, key);
    assert.equal(isOwnedObjectKey(key, other), false, key);
  }
  assert.equal(mediaKeyOwner(keys[0]), owner);
  assert.equal(isOwnedMediaKey(keys[1], other), false);
  for (const bad of [`posts/${owner}/${image}.webp`, `posts/${owner}/${post}/${image}.gif`, `posts/${owner}/${post}/../${image}.webp`, `comment-images/${owner}/${post}/${image}.png`, `clips/${owner}/${post}.png`, `other/${owner}/${post}.webp`, `${keys[0]}/`, ` ${keys[0]}`]) {
    assert.equal(isOwnedObjectKey(bad, owner), false, bad);
  }
});

test("postMediaKeys derives every key and reports rows it cannot build instead of guessing", () => {
  const [owner, post] = [randomUUID(), randomUUID()];
  const ids = [randomUUID(), randomUUID()];
  const built = postMediaKeys(owner, post, [{ id: ids[0], mimeType: "image/png" }, { id: ids[1], mimeType: "image/webp" }]);
  assert.deepEqual(built.keys.map((k) => k.key), [`posts/${owner}/${post}/${ids[0]}.png`, `posts/${owner}/${post}/${ids[1]}.webp`]);
  assert.equal(built.invalid, 0);
  const bad = postMediaKeys(owner, post, [{ id: ids[0], mimeType: "image/png" }, { id: "../../etc", mimeType: "image/png" }, { id: ids[1], mimeType: "application/pdf" }]);
  assert.equal(bad.keys.length, 1);
  assert.equal(bad.invalid, 2);
});

// ---------------------------------------------------------------------------
// Browser-side preparation and the carousel frame
// ---------------------------------------------------------------------------

test("small photos are uploaded as they are, large ones are re-encoded to at most 2560 px", () => {
  const plan = (size: number, width: number, height: number, animated = false) => planImagePrep({ size, width, height, animated }, photoPrepare);
  assert.equal(plan(900_000, 1080, 1350).recompress, false);
  const big = plan(12_000_000, 4032, 3024);
  assert.equal(big.recompress, true);
  assert.deepEqual([big.width, big.height], [2560, 1920]);
  const tall = plan(3_000_000, 1500, 6000);
  assert.deepEqual([tall.width, tall.height], [640, 2560]);
  const heavySmallFrame = plan(5_000_000, 1200, 1200);
  assert.equal(heavySmallFrame.recompress, true);
  assert.deepEqual([heavySmallFrame.width, heavySmallFrame.height], [1200, 1200], "never scaled up");
  assert.equal(plan(5_000_000, 3000, 2000, true).recompress, false, "an animated image keeps its frames");
  assert.equal(plan(PHOTO_MAX_BYTES + 1, 1000, 1000).tooBig, true);
});

test("comment images over 5 MB are shrunk, smaller ones are left alone", () => {
  const plan = (size: number, width = 2000, height = 1500) => planImagePrep({ size, width, height, animated: false }, commentImagePrepare);
  assert.equal(plan(4_000_000).recompress, false);
  assert.equal(plan(6_000_000).recompress, true);
  assert.equal(plan(6_000_000).tooBig, true);
  assert.equal(commentImagePrepare.maxBytes, COMMENT_IMAGE_MAX_BYTES);
});

test("animated WebP and PNG are recognised from their headers", () => {
  assert.equal(isAnimatedImage(webpExtended(100, 100, 0x02)), true);
  assert.equal(isAnimatedImage(webpExtended(100, 100, 0x00)), false);
  assert.equal(isAnimatedImage(webpLossy(100, 100)), false);
  assert.equal(isAnimatedImage(png(10, 10, [...be32(8), ...text("acTL")])), true);
  assert.equal(isAnimatedImage(png(10, 10)), false);
});

test("the carousel frame follows each image's own shape, within a sane range, and never crops", () => {
  assert.equal(carouselRatio(1080, 1350), 0.8);
  assert.equal(carouselRatio(1920, 1080), 1920 / 1080);
  assert.equal(carouselRatio(1000, 1000), 1);
  assert.equal(carouselRatio(100, 2000), CAROUSEL_MIN_RATIO);
  assert.equal(carouselRatio(5000, 500), CAROUSEL_MAX_RATIO);
  assert.equal(carouselRatio(0, 0), 1);
  const carousel = strip(read("components/post/photo-carousel.tsx"));
  assert.match(carousel, /object-contain/);
  assert.doesNotMatch(carousel, /object-cover/);
  assert.match(carousel, /aria-label="Previous photo"/);
  assert.match(carousel, /aria-label="Next photo"/);
  assert.match(carousel, /\{index \+ 1\}\/\{count\}/);
  assert.match(carousel, /snap-x snap-mandatory overflow-x-auto/, "touch swipe is native scroll snapping");
  assert.match(carousel, /event\.key === "ArrowLeft"/);
  assert.match(carousel, /event\.key === "ArrowRight"/);
  assert.match(carousel, /count > 1 \?/, "no arrows or counter for a single photo");
});
