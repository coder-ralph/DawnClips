import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { editWindowMs, joinClipText, parseTimestamp, splitClipText, TITLE_MAX } from "../lib/clip-text";
import { isValidTag, resolveHeroQuery, searchHeroes, slugifyTag, tagLabel } from "../lib/heroes";

test("hero search suggests by name prefix, role and lane", () => {
  assert.equal(searchHeroes("Ter")[0]?.name, "Terizla");
  assert.ok(searchHeroes("mage").every((hero) => hero.role === "mage" || hero.name.toLowerCase().includes("mage")));
  assert.ok(searchHeroes("gold lane").length > 0);
  assert.deepEqual(resolveHeroQuery("x"), []);
  assert.ok(resolveHeroQuery("terizla").includes("terizla"));
});

test("one composer text splits into a title and a description", () => {
  const { title, description } = splitClipText("Savage with Gusion\nRotation was clean");
  assert.equal(title, "Savage with Gusion");
  assert.equal(description, "Rotation was clean");
  assert.equal(joinClipText(title, description), "Savage with Gusion\nRotation was clean");
  assert.ok(splitClipText("word ".repeat(100)).title.length <= TITLE_MAX);
  assert.equal(splitClipText("   ").title, "");
});

test("edit window closes 15 minutes after publishing", () => {
  const until = new Date(Date.now() + 5 * 60_000).toISOString();
  assert.ok(editWindowMs(until, Date.now()) > 0);
  assert.equal(editWindowMs(new Date(Date.now() - 1000).toISOString(), Date.now()), 0);
});

test("moment timestamps parse mm:ss and reject junk", () => {
  assert.equal(parseTimestamp("1:23"), 83);
  assert.equal(parseTimestamp("45"), 45);
  assert.equal(parseTimestamp("1:60"), null);
  assert.equal(parseTimestamp("abc"), null);
});

test("schema-phase6 is part of schema.sql and keeps existing RLS untouched", () => {
  const phase = readFileSync("schema-phase6.sql", "utf8");
  const schema = readFileSync("schema.sql", "utf8");
  for (const fn of ["edit_clip", "set_clip_pinned", "explore_search", "set_clip_moments", "clip_insights", "record_clip_watch"]) {
    assert.match(phase, new RegExp(`function public\\.${fn}\\b`));
    assert.match(schema, new RegExp(`function public\\.${fn}\\b`));
  }
  assert.doesNotMatch(phase, /drop policy|alter policy/i);
});

test("schema-phase7 fixes the viewer_clip_flags alias clash and is part of schema.sql", () => {
  const phase = readFileSync("schema-phase7.sql", "utf8");
  const schema = readFileSync("schema.sql", "utf8");
  assert.match(phase, /unnest\(ids\[1:50\]\) as q\(cid\)/);
  assert.doesNotMatch(phase, /as id\b/);
  assert.match(schema, /Phase 7: fix viewer_clip_flags/);
});

test("custom tags are slugged, validated and labelled", () => {
  assert.equal(slugifyTag("Exp lane"), "exp-lane");
  assert.equal(slugifyTag("  Terizla!! "), "terizla");
  assert.equal(slugifyTag("###"), "");
  assert.ok(slugifyTag("x".repeat(80)).length <= 40);
  assert.ok(isValidTag("exp-lane") && !isValidTag("Exp Lane") && !isValidTag(""));
  assert.equal(tagLabel("terizla"), "Terizla");
  assert.equal(tagLabel("exp-lane"), "Exp Lane");
});

test("schema-phase8 adds partial tag search and moments_for_clips", () => {
  const phase = readFileSync("schema-phase8.sql", "utf8");
  const schema = readFileSync("schema.sql", "utf8");
  assert.match(phase, /function public\.moments_for_clips/);
  assert.match(phase, /tag_needle/);
  assert.match(schema, /DawnClips Phase 8/);
});

test("schema-phase9 grants service_role table access and is part of schema.sql", () => {
  const phase = readFileSync("schema-phase9.sql", "utf8");
  const schema = readFileSync("schema.sql", "utf8");
  assert.match(phase, /grant select, insert, update, delete on all tables in schema public to service_role/);
  assert.match(schema, /DawnClips Phase 9/);
});
