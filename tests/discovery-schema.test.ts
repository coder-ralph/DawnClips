import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync(new URL("../schema.sql", import.meta.url), "utf8");

test("explore and profile tabs enforce privacy inside the database", () => {
  assert.match(schema, /function public\.search_explore/);
  assert.match(schema, /function public\.profile_activity/);
  assert.match(schema, /not coalesce\(settings\.show_likes, true\)/);
  assert.match(schema, /not coalesce\(settings\.show_followers, true\)/);
  assert.match(schema, /users_are_blocked\(viewer, c\.user_id\)/);
  assert.match(schema, /web_push_enabled = false/);
});
