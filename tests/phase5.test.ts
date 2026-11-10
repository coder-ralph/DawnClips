import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canEraseRecords, confirmedDeletion, isModerator, remainingObjectKeys } from "../lib/deletion-plan";
import { plainText } from "../lib/text";

test("deletion requires the exact confirmation and keeps failed object keys", () => {
  assert.equal(confirmedDeletion("DELETE"), true);
  assert.equal(confirmedDeletion("delete"), false);
  assert.deepEqual(remainingObjectKeys(["a", "b", "a"], ["a"]), ["b"]);
  assert.equal(canEraseRecords([]), true);
  assert.equal(canEraseRecords(["b"]), false);
});

test("moderation identity is an allowlist, not a client role", () => {
  const previous = process.env.MODERATOR_CLERK_USER_IDS;
  process.env.MODERATOR_CLERK_USER_IDS = "user_mod";
  assert.equal(isModerator("user_mod"), true);
  assert.equal(isModerator("user_other"), false);
  assert.equal(isModerator(null), false);
  process.env.MODERATOR_CLERK_USER_IDS = previous;
});

test("report text cannot keep markup", () => {
  assert.equal(plainText("<script>alert(1)</script>hello"), "alert(1)hello");
});

test("the public index does not select private profile fields", () => {
  const schema = readFileSync(new URL("../schema.sql", import.meta.url), "utf8");
  const start = schema.indexOf("function public.public_index");
  const fn = schema.slice(start, schema.indexOf("revoke all on function public.public_index"));
  assert.equal(fn.includes("email"), false);
  assert.equal(fn.includes("clerk_user_id"), false);
  assert.match(fn, /visibility = 'public'/);
});
