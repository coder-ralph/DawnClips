import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("/api/clips/[id]/comments lists and posts comments (GET and POST), nothing else", () => {
  const source = read("app/api/clips/[id]/comments/route.ts");
  assert.match(source, /export async function GET/);
  assert.match(source, /export async function POST/);
  assert.match(source, /"list_comments"/);
  assert.match(source, /"add_comment"/);
  assert.doesNotMatch(source, /export async function (PATCH|DELETE)/);
});

test("/api/comments/[id] edits and deletes a comment (PATCH and DELETE), nothing else", () => {
  const source = read("app/api/comments/[id]/route.ts");
  assert.match(source, /export async function PATCH/);
  assert.match(source, /export async function DELETE/);
  assert.match(source, /"edit_comment"/);
  assert.match(source, /"delete_comment"/);
  assert.doesNotMatch(source, /export async function (GET|POST)/);
});
