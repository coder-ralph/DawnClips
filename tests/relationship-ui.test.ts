import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { isProfilePeopleKind, isRelationshipListKind, noRelationship, parseRelationship, relationshipLists } from "../lib/relationships";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

test("parseRelationship reads the database answer and defaults everything to false", () => {
  assert.deepEqual(parseRelationship(null), noRelationship);
  assert.deepEqual(parseRelationship("nope"), noRelationship);
  assert.deepEqual(parseRelationship({ following: true, followed_by: true, muted: true, restricted: false, blocked: false }), {
    following: true,
    followedBy: true,
    muted: true,
    restricted: false,
    blocked: false,
  });
  assert.equal(parseRelationship({ muted: "yes" }).muted, false, "only a real true counts");
});

test("only the known list kinds are accepted", () => {
  for (const kind of ["blocked", "muted", "restricted"]) assert.equal(isRelationshipListKind(kind), true);
  for (const kind of ["followers", "", "BLOCKED", "../x"]) assert.equal(isRelationshipListKind(kind), false);
  assert.equal(isProfilePeopleKind("followers"), true);
  assert.equal(isProfilePeopleKind("following"), true);
  assert.equal(isProfilePeopleKind("blocked"), false);
});

test("empty states use the wording from the brief", () => {
  assert.equal(relationshipLists.blocked.empty, "You haven't blocked anyone yet.");
  assert.equal(relationshipLists.muted.empty, "You haven't muted anyone yet.");
  assert.equal(relationshipLists.restricted.empty, "You haven't restricted anyone yet.");
});

test("the Settings explainers keep Mute and Restrict distinct", () => {
  assert.match(relationshipLists.muted.explainer, /feed/i);
  assert.match(relationshipLists.restricted.explainer, /comment/i);
  assert.notEqual(relationshipLists.muted.explainer, relationshipLists.restricted.explainer);
});

test("Settings links to the three lists and the list page rejects unknown kinds", () => {
  assert.match(read("app/(main)/settings/page.tsx"), /<RelationshipLinks\s*\/>/);
  const links = read("components/settings/relationship-links.tsx");
  assert.match(links, /\/settings\/\$\{/);
  const page = read("app/(main)/settings/[list]/page.tsx");
  assert.match(page, /isRelationshipListKind/);
  assert.match(page, /notFound\(\)/);
  assert.match(page, /auth\.protect\(\)/);
});

test("clip menu: mute/restrict/unfollow only for other people, never next to a block", () => {
  const menu = strip(read("components/feed/clip-menu.tsx"));
  const other = menu.slice(menu.indexOf("} else if (isSignedIn) {"));
  assert.ok(other.indexOf("relationship.blocked") < other.indexOf("muteRestrictItems"), "blocked is checked before mute/restrict");
  assert.match(other, /if \(relationship\.following\)[\s\S]*Unfollow/);
  const own = menu.slice(menu.indexOf("if (isSignedIn && isOwn) {", menu.indexOf("items.push({ label: \"Copy link\"")), menu.indexOf("} else if (isSignedIn) {"));
  assert.doesNotMatch(own, /muteRestrictItems|Unfollow|Block/);
});

test("mute and restrict items show state and flip the action", () => {
  const src = read("components/social/relationship-actions.tsx");
  assert.match(src, /Unmute @/);
  assert.match(src, /Unrestrict @/);
  assert.match(src, /meta: relationship\.muted \? "Muted"/);
  assert.match(src, /meta: relationship\.restricted \? "Restricted"/);
  assert.match(src, /setMuted\(!relationship\.muted\)/);
  assert.match(src, /setRestricted\(!relationship\.restricted\)/);
});

test("optimistic changes roll back when the server refuses", () => {
  const src = strip(read("components/social/relationship-actions.tsx"));
  for (const field of ["muted", "restricted"]) assert.match(src, new RegExp(`patch\\(\\{ ${field}: !next \\}\\)`));
  assert.match(src, /patch\(\{ following: true \}\)/);
  assert.match(src, /patch\(\{ followedBy: true \}\)/);
});

test("profile menu offers Remove follower only when they follow you and you have not blocked them", () => {
  const src = strip(read("components/profile/profile-menu.tsx"));
  assert.match(src, /if \(!relationship\.blocked\) \{[\s\S]*if \(relationship\.followedBy\) items\.push\(\{ label: "Remove follower"/);
  assert.match(src, /Remove follower/);
  assert.match(src, /RemoveFollowerDialog/);
  assert.doesNotMatch(src.slice(src.indexOf("removeFollower")), /setBlocked\(true\)|setRestricted\(true\)/, "removing a follower never blocks or restricts");
});

test("follower list: Follow back only on your own followers", () => {
  const src = read("components/profile/people-list.tsx");
  assert.match(src, /isOwnList && kind === "followers"/);
  assert.match(src, /followLabel/);
  const button = read("components/social/follow-button.tsx");
  assert.match(button, /followLabel = "Follow"/);
  assert.match(button, /aria-label/);
});

test("people lists load pages with a cursor, from the server, and are never cached", () => {
  const route = read("app/api/profiles/[id]/people/route.ts");
  assert.match(route, /isUuid/);
  assert.match(route, /isProfilePeopleKind/);
  assert.match(route, /no-store/);
  const rel = read("app/api/relationships/[kind]/route.ts");
  assert.match(rel, /isRelationshipListKind/);
  assert.match(rel, /no-store|fetchRelationshipProfiles/);
});

test("write routes require sign-in and a valid profile id; the database decides the rest", () => {
  for (const path of ["mute", "restrict", "remove-follower"]) {
    const file = `app/api/profiles/[id]/${path}/route.ts`;
    assert.ok(existsSync(new URL(`../${file}`, import.meta.url)), `${file} exists`);
  }
  const shared = read("lib/profile-controls.ts");
  assert.match(shared, /isUuid/);
  assert.match(shared, /set_profile_control/);
  assert.match(shared, /auth\(\)/);
  const remove = read("app/api/profiles/[id]/remove-follower/route.ts");
  assert.match(remove, /remove_follower/);
  assert.match(remove, /isUuid/);
  assert.match(remove, /auth\(\)/);
});

test("account deletion also clears mutes and restrictions", () => {
  assert.match(read("lib/deletion.ts"), /profile_controls/);
});
