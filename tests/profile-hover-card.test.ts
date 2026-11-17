import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { followersLabel, placeCard } from "../lib/profile-preview";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

test("follower counts read naturally and stay hidden when the person hides them", () => {
  assert.equal(followersLabel(null), null);
  assert.equal(followersLabel(0), "0 followers");
  assert.equal(followersLabel(1), "1 follower");
  assert.equal(followersLabel(659), "659 followers");
  assert.equal(followersLabel(12345), "12K followers");
});

test("the card opens below its trigger, flips above when there is no room, and stays on screen", () => {
  const viewport = { width: 1000, height: 800 };
  const card = { width: 320, height: 240 };
  assert.deepEqual(placeCard({ left: 100, top: 100, bottom: 120 }, card, viewport), { top: 128, left: 100, placement: "below" });
  const flipped = placeCard({ left: 100, top: 700, bottom: 720 }, card, viewport);
  assert.equal(flipped.placement, "above");
  assert.equal(flipped.top, 700 - 8 - 240);
  assert.equal(placeCard({ left: 900, top: 100, bottom: 120 }, card, viewport).left, 1000 - 320 - 8);
  assert.equal(placeCard({ left: -50, top: 100, bottom: 120 }, card, viewport).left, 8);
  // No room above or below: it stays below and is clamped inside the viewport.
  const tight = placeCard({ left: 10, top: 100, bottom: 120 }, { width: 320, height: 780 }, viewport);
  assert.ok(tight.top >= 8 && tight.top + 780 <= 800 - 8 + 0.0001);
});

test("the preview endpoint reuses the public profile and relationship checks and is never shared between viewers", () => {
  const source = strip(read("app/api/profiles/[id]/preview/route.ts"));
  assert.match(source, /export async function GET/);
  assert.doesNotMatch(source, /export async function (POST|PATCH|DELETE|PUT)/);
  assert.match(source, /getPublicProfile\(id\)/);
  assert.match(source, /"profile_relationship"/);
  // Missing, deleted and blocked profiles all come back as the same 404.
  assert.match(source, /status: 404/);
  assert.match(source, /Cache-Control": "private, no-store"/);
  // Nothing private is returned: no email, clerk id or role.
  const response = source.slice(source.indexOf("Response.json(\n"));
  assert.doesNotMatch(response, /email|clerkUserId|roleId|country/);
});

test("the card shows name, username, bio, followers and a Follow button, not for your own profile", () => {
  const source = strip(read("components/social/profile-hover-card.tsx"));
  assert.match(source, /profile\.displayName/);
  assert.match(source, /@\{profile\.username\}/);
  assert.match(source, /profile\.bio/);
  assert.match(source, /followersLabel\(profile\.followersCount\)/);
  assert.match(source, /profile\.isOwn \? null/);
  assert.match(source, /<FollowButton/);
  // Mouse only: touch never opens it. Escape closes the card without closing the viewer behind it.
  assert.match(source, /pointerType === "touch"/);
  assert.match(source, /event\.key !== "Escape"/);
  assert.match(source, /event\.preventDefault\(\)/);
  // The link itself is a normal <Link>: it keeps its href and its own click handler.
  assert.match(source, /<Link\s+\{\.\.\.props\}/);
  assert.match(source, /onClick\?\.\(event\)/);
});

test("names and avatars open the card in the feed, the viewer header and the comments", () => {
  const feed = strip(read("components/feed/clip-card.tsx"));
  assert.equal((feed.match(/<ProfileHoverLink/g) ?? []).length, 2);
  const viewer = strip(read("components/clip/clip-viewer.tsx"));
  assert.equal((viewer.match(/<ProfileHoverLink/g) ?? []).length, 2);
  const comments = strip(read("components/social/comment-section.tsx"));
  assert.equal((comments.match(/<ProfileHoverLink/g) ?? []).length, 2);
  // Their destinations are unchanged.
  assert.match(feed, /<ProfileHoverLink username=\{clip\.username\} href=\{profileHref\}/);
  assert.match(viewer, /href=\{`\/profile\/\$\{clip\.username\}`\}/);
  assert.match(comments, /href=\{`\/profile\/\$\{comment\.username\}`\}/);
});

test("the viewer's close and details buttons have a hover effect that respects reduced motion", () => {
  const viewer = strip(read("components/clip/clip-viewer.tsx"));
  const roundButton = viewer.match(/const roundButton =\s*"([^"]+)"/)?.[1] ?? "";
  assert.match(roundButton, /hover:bg-neutral-700\/85/);
  assert.match(roundButton, /transition/);
  assert.match(roundButton, /motion-safe:active:scale-95/);
  assert.match(roundButton, /focus-visible:outline-white/);
});
