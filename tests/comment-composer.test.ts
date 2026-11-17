import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { allEmojis, emojiGroups } from "../lib/emoji";
import { insertAtCursor } from "../lib/text-insert";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

test("an emoji is inserted at the caret, in the middle of existing text", () => {
  assert.deepEqual(insertAtCursor("Great play", 5, 5, "🔥", 500), { value: "Great🔥 play", cursor: 5 + "🔥".length });
  assert.deepEqual(insertAtCursor("Great play", 0, 0, "👏", 500), { value: "👏Great play", cursor: 2 });
  assert.deepEqual(insertAtCursor("Great play", 10, 10, "😂", 500), { value: "Great play😂", cursor: 12 });
});

test("an emoji replaces the selected text", () => {
  assert.deepEqual(insertAtCursor("Great play", 6, 10, "🔥", 500), { value: "Great 🔥", cursor: 8 });
});

test("a missing caret appends, and out-of-range positions are clamped", () => {
  assert.equal(insertAtCursor("abc", null, null, "🎮", 500)?.value, "abc🎮");
  assert.equal(insertAtCursor("abc", -4, 99, "🎮", 500)?.value, "🎮");
  assert.equal(insertAtCursor("abc", 99, 99, "🎮", 500)?.value, "abc🎮");
});

test("nothing is inserted when the comment would exceed the limit", () => {
  assert.equal(insertAtCursor("x".repeat(499), 499, 499, "🔥", 500), null);
  assert.equal(insertAtCursor("x".repeat(498), 498, 498, "🔥", 500)?.value.length, 500);
  // Replacing a selection frees room.
  assert.ok(insertAtCursor("x".repeat(500), 0, 2, "🔥", 500));
});

test("the emoji set is plain Unicode: no duplicates, no images, no empty entries", () => {
  assert.ok(emojiGroups.length >= 3);
  assert.equal(new Set(allEmojis).size, allEmojis.length);
  for (const emoji of allEmojis) {
    assert.ok(emoji.length >= 1 && emoji.length <= 8, emoji);
    assert.doesNotMatch(emoji, /^[\x00-\x7f]+$/, `${emoji} is an emoji, not ASCII text`);
    assert.doesNotMatch(emoji, /https?:|\.png|\.gif|\.webp|\.svg/i);
  }
  const source = read("lib/emoji.ts");
  assert.doesNotMatch(source, /import /);
});

test("no emoji or emote package or image set was added", () => {
  const manifest = JSON.parse(read("package.json")) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  const names = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });
  assert.deepEqual(names.filter((name) => /emoji|emote|picker/i.test(name)), []);
});

test("the composer keeps the send button and the emoji picker inside the comment box", () => {
  const source = strip(read("components/social/comment-composer.tsx"));
  const form = source.slice(source.indexOf("<form"), source.indexOf("</form>"));
  assert.match(form, /<textarea/);
  assert.match(form, /type="submit"/);
  assert.match(form, /aria-label="Insert emoji"/);
  assert.match(form, /aria-expanded=\{emojiOpen\}/);
  assert.match(form, /aria-label=\{submitLabel\}/);
  // Ctrl or Cmd + Enter sends; the picker closes on Escape without closing the viewer behind it.
  assert.match(form, /event\.ctrlKey \|\| event\.metaKey/);
  assert.match(form, /event\.key === "Escape" && emojiOpen/);
  assert.match(form, /event\.preventDefault\(\)/);
  assert.match(source, /insertAtCursor\(value, node\?\.selectionStart/);
  assert.match(source, /setSelectionRange\(caret\.current, caret\.current\)/);
  assert.doesNotMatch(source, /<img|next\/image|https?:\/\//);
});

test("the comment section uses the composer for comments and replies", () => {
  const source = strip(read("components/social/comment-section.tsx"));
  assert.equal((source.match(/<CommentComposer/g) ?? []).length, 2);
  assert.match(source, /id="new-comment"/);
  assert.match(source, /submitLabel="Post comment"/);
  assert.match(source, /submitLabel="Post reply"/);
  assert.match(source, /maxLength=\{MAX_LENGTH\}/);
});
