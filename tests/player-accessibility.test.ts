import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { audioLabel, likeLabel, playLabel } from "../lib/a11y-labels";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

test("play and pause labels follow the video state", () => {
  assert.equal(playLabel(false), "Play video");
  assert.equal(playLabel(true), "Pause video");
});

test("audio labels describe the sound, and unmuted audio is not 'playing' while the video is paused", () => {
  assert.equal(audioLabel({ muted: true, volume: 1, playing: true }), "Audio is muted");
  assert.equal(audioLabel({ muted: true, volume: 1, playing: false }), "Audio is muted");
  assert.equal(audioLabel({ muted: false, volume: 0, playing: true }), "Audio is muted");
  assert.equal(audioLabel({ muted: false, volume: 0.6, playing: true }), "Audio is playing");
  assert.equal(audioLabel({ muted: false, volume: 0.6, playing: false }), "Audio is on");
});

test("like labels follow the liked state", () => {
  assert.equal(likeLabel(false), "Like video");
  assert.equal(likeLabel(true), "Unlike video");
});

test("the player's icon controls have descriptive names that match their tooltips", () => {
  const source = strip(read("components/video/video-player.tsx"));
  assert.match(source, /aria-label=\{playLabel\(playing\)\} title=\{playLabel\(playing\)\}/);
  assert.match(source, /const soundLabel = audioLabel\(\{ muted, volume, playing \}\)/);
  assert.match(source, /aria-label=\{soundLabel\}\s*title=\{soundLabel\}/);
  assert.match(source, /aria-label="Adjust volume"/);
  assert.match(source, /aria-label=\{loading \? "Loading video" : "Play video"\}/);
  assert.match(source, /aria-label=\{`Playback speed \$\{rateLabel\(rate\)\}`\}\s*title=\{`Playback speed \$\{rateLabel\(rate\)\}`\}/);
  // The speed button opens a popup, so it reports whether it is open.
  assert.match(source, /aria-expanded=\{menu === "speed"\}/);
});

test("no control carries both a changing name and aria-pressed, and the old labels are gone", () => {
  const player = strip(read("components/video/video-player.tsx"));
  assert.doesNotMatch(player, /aria-pressed/);
  assert.doesNotMatch(player, /"Unmute"|"Mute"|aria-label="Volume"|aria-label=\{playing \? "Pause" : "Play"\}/);
  // The <video> element is named by the group around it, not a second time.
  assert.doesNotMatch(player, /<video[\s\S]*?aria-label=\{title\}/);
  const like = strip(read("components/social/like-button.tsx"));
  assert.match(like, /aria-label=\{likeLabel\(state\.liked\)\}/);
  assert.doesNotMatch(like, /aria-pressed/);
  assert.doesNotMatch(like, /sr-only/);
});

test("the save button is a toggle with one stable name and aria-pressed", () => {
  const source = strip(read("components/social/bookmark-button.tsx"));
  assert.match(source, /aria-label="Save video"/);
  assert.match(source, /aria-pressed=\{state\}/);
  assert.doesNotMatch(source, /sr-only/);
});

test("the viewer's close button and the clip menu are named for the video", () => {
  assert.match(strip(read("components/clip/clip-viewer.tsx")), /aria-label="Close video" title="Close video"/);
  const menu = strip(read("components/feed/clip-menu.tsx"));
  assert.match(menu, /label="More video options"/);
  // ActionMenu already exposes aria-haspopup and aria-expanded for it.
  const actionMenu = strip(read("components/ui/action-menu.tsx"));
  assert.match(actionMenu, /aria-haspopup="menu"/);
  assert.match(actionMenu, /aria-expanded=\{open\}/);
});
