import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync(new URL("../schema.sql", import.meta.url), "utf8").replace(/--.*$/gm, "");

test("social mutations are atomic functions, not client counter writes", () => {
  assert.match(schema, /function public\.set_like\(target uuid, should_like boolean\)/);
  assert.match(schema, /function public\.set_follow\(target uuid, should_follow boolean\)/);
  assert.match(schema, /function public\.add_comment\(target uuid, parent uuid, body text\)/);
  assert.match(schema, /on conflict \(user_id, clip_id\) do nothing/);
  assert.match(schema, /on conflict \(follower_id, following_id\) do nothing/);
  assert.match(schema, /dawnclips\.allow_counter_write/);
  assert.match(schema, /self follow/);
});

test("clients cannot insert likes, comments, follows, or bookmarks directly", () => {
  assert.match(schema, /revoke insert, update, delete on public\.likes from anon, authenticated/);
  assert.match(schema, /revoke insert, update, delete on public\.comments from anon, authenticated/);
  assert.match(schema, /revoke insert, update, delete on public\.follows from anon, authenticated/);
  assert.match(schema, /revoke insert, update, delete on public\.bookmarks from anon, authenticated/);
  assert.match(schema, /grant execute on function public\.set_like\(uuid, boolean\) to authenticated/);
  assert.doesNotMatch(schema, /grant execute on function public\.notify_user\(uuid, uuid, text, uuid\) to authenticated/);
});
