import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const schema = readFileSync(new URL("../schema.sql", import.meta.url), "utf8").replace(/--.*$/gm, "");
const tables = [
  "profiles",
  "profile_settings",
  "clips",
  "likes",
  "comments",
  "follows",
  "bookmarks",
  "notifications",
  "reports",
  "blocks",
  "account_deletions",
  "rate_limits",
  "clip_views",
];

test("every table enables row level security", () => {
  for (const table of tables) {
    assert.match(schema, new RegExp(`alter table public\\.${table} enable row level security`));
  }
});

test("ownership policies compare the Clerk subject, not auth.uid()", () => {
  assert.doesNotMatch(schema, /auth\.uid\(\)/);
  assert.match(schema, /auth\.jwt\(\) ->> 'sub'/);
  assert.match(schema, /profiles_select_own/);
  assert.match(schema, /profiles_insert_own/);
  assert.match(schema, /profiles_update_own/);
});

test("public clip reads require highlight privacy and playback is not a public function", () => {
  assert.match(schema, /s\.show_highlights/);
  assert.match(schema, /grant execute on function public\.authorize_clip_playback\(uuid, text\) to service_role/);
  assert.doesNotMatch(schema, /grant execute on function public\.authorize_clip_playback\(uuid, text\) to anon/);
});

test("public profile function does not return private columns", () => {
  const start = schema.indexOf("function public.get_public_profile");
  const end = schema.indexOf("revoke all on function public.requesting_clerk_id");
  const fn = schema.slice(start, end);
  assert.equal(fn.includes("email"), false);
  assert.equal(fn.includes("role_id"), false);
  assert.equal(fn.includes("clerk_user_id"), false);
});
