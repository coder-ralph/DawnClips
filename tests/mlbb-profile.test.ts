import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  canSelectRole,
  formatRoles,
  formatStars,
  isRank,
  maxRankStars,
  normalizeRoles,
  rankInfo,
  ranks,
  roles,
  rolesError,
  starRangeText,
  starsError,
  toggleRole,
  type RoleValue,
} from "../lib/mlbb-profile";
import { profileUpdateSchema } from "../lib/validations/profile";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

test("the 10 ranks are listed in the requested order, and only Mythic and up carry a star range", () => {
  assert.deepEqual(ranks.map((rank) => rank.label), [
    "Warrior", "Elite", "Master", "Grandmaster", "Epic", "Legend", "Mythic", "Mythical Honor", "Mythical Glory", "Mythical Immortal",
  ]);
  assert.deepEqual(ranks.map((rank) => rank.value), [
    "warrior", "elite", "master", "grandmaster", "epic", "legend", "mythic", "mythical_honor", "mythical_glory", "mythical_immortal",
  ]);
  assert.deepEqual(ranks.filter((rank) => rank.stars).map((rank) => [rank.value, rank.stars]), [
    ["mythic", { min: 0, max: 24 }],
    ["mythical_honor", { min: 25, max: 49 }],
    ["mythical_glory", { min: 50, max: 99 }],
    ["mythical_immortal", { min: 100, max: maxRankStars }],
  ]);
  assert.equal(isRank("mythic"), true);
  assert.equal(isRank("Mythic"), false);
  assert.equal(isRank(""), false);
  assert.equal(starRangeText("mythic"), "0–24 stars");
  assert.equal(starRangeText("mythical_immortal"), "100 or more stars");
  assert.equal(starRangeText("legend"), null);
  assert.equal(formatStars(160), "160 stars");
  assert.equal(formatStars(1), "1 star");
});

test("stars must fit the rank", () => {
  // Fine: empty (stars are optional), and every edge of every range.
  for (const [rank, stars] of [["", ""], ["warrior", ""], ["mythic", ""], ["mythic", "0"], ["mythic", "24"], ["mythical_honor", "25"], ["mythical_honor", "49"],
    ["mythical_glory", "50"], ["mythical_glory", "99"], ["mythical_immortal", "100"], ["mythical_immortal", "160"], ["mythical_immortal", "9999"]]) {
    assert.equal(starsError(rank, stars), null, `${rank} ${stars}`);
  }
  // Not fine.
  for (const [rank, stars] of [["mythic", "25"], ["mythical_honor", "24"], ["mythical_honor", "50"], ["mythical_glory", "49"], ["mythical_glory", "100"],
    ["mythical_immortal", "99"], ["mythical_immortal", "10000"], ["warrior", "3"], ["legend", "5"], ["", "5"], ["mythic", "-1"], ["mythic", "1.5"],
    ["mythic", "abc"], ["mythical_immortal", "1e3"], ["mythic", "12345"]]) {
    assert.notEqual(starsError(rank, stars), null, `${rank} ${stars}`);
  }
  assert.equal(starsError("mythical_immortal", "99"), "Mythical Immortal is 100 or more stars.");
  assert.equal(starsError("mythic", "30"), "Mythic is 0–24 stars.");
  assert.equal(starsError("elite", "2"), "Stars are not counted for Elite.");
  assert.equal(rankInfo("epic")?.label, "Epic");
});

test("favorite roles: up to two, All-Rounder only on its own", () => {
  assert.deepEqual(roles.map((role) => role.label), ["Tank", "Fighter", "Assassin", "Mage", "Marksman", "Support", "All-Rounder"]);
  for (const ok of [[], ["tank"], ["tank", "mage"], ["support", "fighter"], ["all_rounder"]]) assert.equal(rolesError(ok), null, ok.join());
  assert.equal(rolesError(["tank", "mage", "support"]), "Choose up to two roles.");
  assert.equal(rolesError(["tank", "tank"]), "Choose each role once.");
  assert.equal(rolesError(["all_rounder", "tank"]), "All-Rounder can't be combined with other roles.");
  assert.equal(rolesError(["tank", "all_rounder"]), "All-Rounder can't be combined with other roles.");
  assert.equal(rolesError(["wizard"]), "Choose roles from the list.");
  // Shown in list order, whatever order they were picked in.
  assert.deepEqual(normalizeRoles(["mage", "tank", "wizard", "tank"]), ["tank", "mage"]);
  assert.equal(formatRoles(["mage", "tank"]), "Tank / Mage");
  assert.equal(formatRoles(["all_rounder"]), "All-Rounder");
  assert.equal(formatRoles([]), "");
});

test("the role picker's clicks follow the same rules", () => {
  let picked: RoleValue[] = [];
  picked = toggleRole(picked, "mage");
  picked = toggleRole(picked, "tank");
  assert.deepEqual(picked, ["tank", "mage"]);
  // A third role is refused.
  assert.equal(canSelectRole(picked, "support"), false);
  assert.deepEqual(toggleRole(picked, "support"), ["tank", "mage"]);
  // Removing one frees a slot.
  picked = toggleRole(picked, "tank");
  assert.deepEqual(picked, ["mage"]);
  assert.deepEqual(toggleRole(picked, "support"), ["mage", "support"]);
  // All-Rounder replaces the rest, and any other role replaces All-Rounder.
  assert.equal(canSelectRole(["tank", "mage"], "all_rounder"), true);
  assert.deepEqual(toggleRole(["tank", "mage"], "all_rounder"), ["all_rounder"]);
  assert.deepEqual(toggleRole(["all_rounder"], "fighter"), ["fighter"]);
  assert.deepEqual(toggleRole(["all_rounder"], "all_rounder"), []);
  // Whatever the clicks, the result always passes the server rule.
  const clicks: RoleValue[] = ["tank", "all_rounder", "mage", "support", "tank", "fighter", "all_rounder", "assassin", "marksman", "mage"];
  let state: RoleValue[] = [];
  for (const click of clicks) {
    state = toggleRole(state, click);
    assert.equal(rolesError(state), null, state.join());
  }
});

// ---------------------------------------------------------------------------
// Server-side validation (the same schema the update action uses)
// ---------------------------------------------------------------------------

const base = { displayName: "Ralph", username: "ralph", bio: "", roleId: "", zoneId: "", country: "PH" };

test("the update schema accepts valid rank, stars and roles, and an old form without them", () => {
  const parse = (extra: Record<string, unknown>) => profileUpdateSchema.safeParse({ ...base, ...extra });
  assert.equal(parse({}).success, true); // nothing sent: nothing set
  const full = parse({ highestRank: "mythical_immortal", rankStars: "160", favoriteRoles: ["tank", "mage"] });
  assert.equal(full.success, true);
  assert.equal(parse({ highestRank: "warrior" }).success, true);
  assert.equal(parse({ highestRank: "mythic", rankStars: "" }).success, true);
  assert.equal(parse({ favoriteRoles: ["all_rounder"] }).success, true);
  assert.equal(parse({ highestRank: "", rankStars: "", favoriteRoles: [] }).success, true);
});

test("the update schema rejects what the database would reject", () => {
  const message = (extra: Record<string, unknown>) => {
    const result = profileUpdateSchema.safeParse({ ...base, ...extra });
    return result.success ? null : result.error.issues[0].message;
  };
  assert.equal(message({ highestRank: "Mythic" }), "Choose a rank from the list.");
  assert.equal(message({ highestRank: "godlike" }), "Choose a rank from the list.");
  assert.equal(message({ highestRank: "mythic", rankStars: "25" }), "Mythic is 0–24 stars.");
  assert.equal(message({ highestRank: "mythical_immortal", rankStars: "99" }), "Mythical Immortal is 100 or more stars.");
  assert.equal(message({ highestRank: "legend", rankStars: "3" }), "Stars are not counted for Legend.");
  assert.equal(message({ highestRank: "", rankStars: "5" }), "Choose a rank before adding stars.");
  assert.equal(message({ highestRank: "mythic", rankStars: "-3" }), "Stars must be a whole number.");
  assert.equal(message({ favoriteRoles: ["tank", "mage", "support"] }), "Choose up to two roles.");
  assert.equal(message({ favoriteRoles: ["all_rounder", "tank"] }), "All-Rounder can't be combined with other roles.");
  assert.equal(message({ favoriteRoles: ["tank", "tank"] }), "Choose each role once.");
  assert.equal(message({ favoriteRoles: ["wizard"] }), "Choose roles from the list.");
  // The existing fields are still checked.
  assert.equal(message({ country: "ZZ" }), "Choose a country.");
});

test("the update action reads the new fields and stores keys, not labels", () => {
  const action = strip(read("app/(main)/settings/actions.ts"));
  assert.match(action, /highestRank: formData\.get\("highestRank"\) \?\? ""/);
  assert.match(action, /rankStars: formData\.get\("rankStars"\) \?\? ""/);
  assert.match(action, /favoriteRoles: formData\.getAll\("favoriteRoles"\)\.map\(String\)/);
  assert.match(action, /highest_rank: input\.highestRank \|\| null/);
  assert.match(action, /rank_stars: input\.highestRank && input\.rankStars !== "" \? Number\(input\.rankStars\) : null/);
  assert.match(action, /favorite_roles: normalizeRoles\(input\.favoriteRoles\)/);
  // The rate limit and the other columns are untouched.
  assert.match(action, /action: "profile_update"/);
  assert.match(action, /role_id: input\.roleId \|\| null/);
  assert.match(action, /country: input\.country/);
});

// ---------------------------------------------------------------------------
// Forms, public profile and badge
// ---------------------------------------------------------------------------

test("Edit profile has the rank and roles fields, with the info tooltip", () => {
  const modal = strip(read("components/profile/edit-profile-modal.tsx"));
  assert.match(modal, /<HighestRankFields defaultRank=\{profile\.highestRank\} defaultStars=\{profile\.rankStars\} \/>/);
  assert.match(modal, /<FavoriteRolesSelect name="favoriteRoles" labelledBy=\{rolesLabelId\} defaultValue=\{profile\.favoriteRoles\} \/>/);
  assert.match(modal, /Favorite roles/);
  assert.ok(modal.includes('const rolesTooltip = "Select up to two roles. If you play across multiple playstyles, select All-Rounder.";'));
  assert.match(modal, /<InfoTip text=\{rolesTooltip\} label="About favorite roles" \/>/);
  // The existing IDs tooltip still works.
  assert.match(modal, /<InfoTip text=\{idsTooltip\} label="About Role ID and Zone ID" \/>/);
  assert.match(modal, /highestRank: string \| null;\s*rankStars: number \| null;\s*favoriteRoles: string\[\];/);

  const rank = strip(read("components/profile/rank-fields.tsx"));
  assert.match(rank, /name="highestRank"/);
  assert.match(rank, /name="rankStars"/);
  assert.match(rank, /type="number"/);
  assert.match(rank, /min=\{range\?\.min\}/);
  assert.match(rank, /max=\{range\?\.max \?\? maxRankStars\}/);
  assert.match(rank, /disabled=\{!range\}/);
  assert.match(rank, /ranks\.map/);

  const picker = strip(read("components/profile/favorite-roles-select.tsx"));
  assert.match(picker, /role="combobox"/);
  assert.match(picker, /aria-multiselectable="true"/);
  assert.match(picker, /<input key=\{role\} type="hidden" name=\{name\} value=\{role\} \/>/);
  assert.match(picker, /event\.key === "Escape" && open[\s\S]*?event\.preventDefault\(\)[\s\S]*?event\.stopPropagation\(\)/);
  assert.match(picker, /toggleRole\(current, role\)/);
});

test("the public profile shows rank and roles only when set", () => {
  const view = strip(read("components/profile/profile-view.tsx"));
  assert.match(view, /<ProfileGameInfo highestRank=\{profile\.highestRank\} rankStars=\{profile\.rankStars\} favoriteRoles=\{profile\.favoriteRoles\} \/>/);
  const info = strip(read("components/profile/profile-game-info.tsx"));
  assert.match(info, /if \(!rank && !roles\) return null;/);
  assert.match(info, /\{rank \? \(/);
  assert.match(info, /\{roles \? \(/);
  assert.match(info, /<dt className="text-muted">Peak rank:<\/dt>/);
  assert.match(info, /<dt className="text-muted">Main roles:<\/dt>/);
  assert.match(info, /<RankBadge rank=\{rank\} \/>/);
  assert.match(info, /rankStars !== null \? /);
  // Loaded from the database for both the public and the own profile.
  const profile = strip(read("lib/profile.ts"));
  assert.match(profile, /role_id, zone_id, country, highest_rank, rank_stars, favorite_roles,/);
  assert.match(profile, /highestRank: isRank\(row\.highest_rank\)/);
});

test("rank badges: text only, one glow colour per rank, animation switched off for reduced motion", () => {
  const badge = strip(read("components/profile/rank-badge.tsx"));
  assert.doesNotMatch(badge, /lucide-react|Swords|Zap|Gem|<svg|<img/);
  const glows = [...badge.matchAll(/glow: "(\d+ \d+ \d+)"/g)].map((match) => match[1]);
  assert.equal(glows.length, 10);
  assert.equal(new Set(glows).size, 10, "every rank has its own glow colour");
  for (const rank of ranks) assert.match(badge, new RegExp(`${rank.value}: \\{ frame:`));
  assert.match(badge, /"--glow": style\.glow/);
  assert.match(badge, /rank-badge-shine/);
  // Immortal is yellow.
  assert.match(badge, /mythical_immortal: \{[^}]*glow: "250 204 21"/);

  const css = read("app/globals.css");
  assert.match(css, /\.rank-badge \{[^}]*animation: badge-glow 2\.4s ease-in-out infinite alternate;/);
  assert.match(css, /\.rank-badge-shine \{[^}]*animation: badge-shine 3s linear infinite;/);
  assert.match(css, /@keyframes badge-glow/);
  assert.match(css, /@keyframes badge-shine/);
  const reduced = css.slice(css.lastIndexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(reduced, /\.rank-badge \{\s*animation: none;\s*\}/);
  assert.match(reduced, /\.rank-badge-shine \{\s*animation: none;\s*background: none;\s*\}/);
});

// ---------------------------------------------------------------------------
// The SQL on a real Postgres engine (PGlite). Skipped when the package is not installed:
//   npm i --no-save @electric-sql/pglite
// ---------------------------------------------------------------------------

test("phase 13 is in schema.sql after phase 12, and adds only nullable/defaulted columns", () => {
  const phase = read("supabase/schema-phase13.sql");
  const schema = read("supabase/schema.sql");
  assert.ok(schema.includes(phase.trim()), "schema.sql contains schema-phase13.sql");
  assert.ok(schema.indexOf("DawnClips Phase 13") > schema.indexOf("DawnClips Phase 12"));
  assert.match(phase, /add column if not exists highest_rank text;/);
  assert.match(phase, /add column if not exists rank_stars integer;/);
  assert.match(phase, /add column if not exists favorite_roles text\[\] not null default '\{\}';/);
  assert.doesNotMatch(strip(phase), /drop (table|column)|delete from|truncate/i);
  // The public profile function keeps its guard rails and does not start returning private columns.
  const fn = phase.slice(phase.indexOf("create or replace function public.get_public_profile"));
  assert.match(fn, /public\.users_are_blocked\(viewer, row\.id\)/);
  assert.match(fn, /deletion_status = 'active'/);
  assert.doesNotMatch(fn, /email|clerk_user_id|zone_id/);
});

type Db = {
  exec: (sql: string) => Promise<unknown>;
  query: (sql: string) => Promise<{ rows: Array<Record<string, unknown>> }>;
  close: () => Promise<void>;
};

async function openDb(): Promise<Db | null> {
  try {
    const name = "@electric-sql/pglite";
    const mod = (await import(name)) as { PGlite: new () => Db };
    return new mod.PGlite();
  } catch {
    return null;
  }
}

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [ann, ben] = [id(1), id(2)];

// A cut-down profiles table (the columns get_public_profile reads) with one profile that exists BEFORE the migration.
const harness = `
  create table public.profiles (
    id uuid primary key, username text not null, display_name text not null, avatar_url text, bio text not null default '',
    role_id text, zone_id text, country text not null default 'PH', deletion_status text not null default 'active',
    created_at timestamptz not null default now(), deleted_at timestamptz, email text
  );
  create table public.profile_settings (profile_id uuid primary key, show_highlights boolean not null default true,
    show_following boolean not null default true, show_followers boolean not null default true,
    show_comments boolean not null default true, show_likes boolean not null default true);
  create table public.clips (id uuid primary key, user_id uuid, status text, visibility text);
  create table public.follows (follower_id uuid, following_id uuid);
  create function public.requesting_profile_id() returns uuid language sql stable as
    $$ select nullif(current_setting('test.viewer', true), '')::uuid $$;
  create function public.users_are_blocked(a uuid, b uuid) returns boolean language sql stable as $$ select false $$;
  insert into public.profiles (id, username, display_name, bio, role_id, zone_id, country, email) values
    ('${ann}', 'ann', 'Ann', 'hello', '123456', '9999', 'ID', 'ann@example.com'),
    ('${ben}', 'ben', 'Ben', '', null, null, 'US', 'ben@example.com');
  insert into public.profile_settings (profile_id) values ('${ann}'), ('${ben}');
`;

test("phase 13 rules hold on Postgres", async (t) => {
  const db = await openDb();
  if (!db) {
    t.skip("install @electric-sql/pglite to run the database tests");
    return;
  }
  try {
    await db.exec(harness);
    const migration = read("supabase/schema-phase13.sql");
    await db.exec(migration);
    await db.exec(migration); // safe to run again

    // Existing profiles keep every value and simply have nothing set for the new fields.
    const before = (await db.query(`select username, bio, role_id, zone_id, country, highest_rank, rank_stars, favorite_roles from public.profiles where id = '${ann}'`)).rows[0];
    assert.deepEqual(before, { username: "ann", bio: "hello", role_id: "123456", zone_id: "9999", country: "ID", highest_rank: null, rank_stars: null, favorite_roles: [] });

    const set = (assignments: string) => db.exec(`update public.profiles set ${assignments} where id = '${ann}'`);
    const bad = (assignments: string, constraint: string) => assert.rejects(set(assignments), new RegExp(constraint), assignments);

    // Allowed.
    await set(`highest_rank = 'mythical_immortal', rank_stars = 160, favorite_roles = array['tank','mage']`);
    await set(`highest_rank = 'mythic', rank_stars = 0`);
    await set(`highest_rank = 'mythic', rank_stars = 24`);
    await set(`highest_rank = 'mythical_honor', rank_stars = 25`);
    await set(`highest_rank = 'mythical_honor', rank_stars = 49`);
    await set(`highest_rank = 'mythical_glory', rank_stars = 50`);
    await set(`highest_rank = 'mythical_glory', rank_stars = 99`);
    await set(`highest_rank = 'mythical_immortal', rank_stars = 100`);
    await set(`highest_rank = 'mythical_immortal', rank_stars = 9999`);
    await set(`highest_rank = 'warrior', rank_stars = null`);
    await set(`highest_rank = 'grandmaster', rank_stars = null, favorite_roles = array['all_rounder']`);
    await set(`highest_rank = null, rank_stars = null, favorite_roles = '{}'`);
    for (const rank of ranks) await set(`highest_rank = '${rank.value}', rank_stars = null`);

    // Rank and stars.
    await bad(`highest_rank = 'godlike'`, "profiles_highest_rank_valid");
    await bad(`highest_rank = 'Mythic'`, "profiles_highest_rank_valid");
    await bad(`highest_rank = 'mythic', rank_stars = 25`, "profiles_rank_stars_range");
    await bad(`highest_rank = 'mythical_honor', rank_stars = 24`, "profiles_rank_stars_range");
    await bad(`highest_rank = 'mythical_honor', rank_stars = 50`, "profiles_rank_stars_range");
    await bad(`highest_rank = 'mythical_glory', rank_stars = 49`, "profiles_rank_stars_range");
    await bad(`highest_rank = 'mythical_glory', rank_stars = 100`, "profiles_rank_stars_range");
    await bad(`highest_rank = 'mythical_immortal', rank_stars = 99`, "profiles_rank_stars_range");
    await bad(`highest_rank = 'mythical_immortal', rank_stars = 10000`, "profiles_rank_stars_range");
    await bad(`highest_rank = 'mythic', rank_stars = -1`, "profiles_rank_stars_range");
    await bad(`highest_rank = 'legend', rank_stars = 3`, "profiles_rank_stars_range");
    await bad(`highest_rank = null, rank_stars = 5`, "profiles_rank_stars_range");

    // Roles.
    await bad(`favorite_roles = array['tank','mage','support']`, "profiles_favorite_roles_valid");
    await bad(`favorite_roles = array['tank','tank']`, "profiles_favorite_roles_valid");
    await bad(`favorite_roles = array['all_rounder','tank']`, "profiles_favorite_roles_valid");
    await bad(`favorite_roles = array['tank','all_rounder']`, "profiles_favorite_roles_valid");
    await bad(`favorite_roles = array['wizard']`, "profiles_favorite_roles_valid");
    await bad(`favorite_roles = array['Tank']`, "profiles_favorite_roles_valid");
    await bad(`favorite_roles = array[null]::text[]`, "profiles_favorite_roles_valid");
    await bad(`favorite_roles = array[['tank'],['mage']]`, "profiles_favorite_roles_valid");

    // The failed updates changed nothing.
    const kept = (await db.query(`select highest_rank, rank_stars, favorite_roles from public.profiles where id = '${ann}'`)).rows[0];
    assert.deepEqual(kept, { highest_rank: "mythical_immortal", rank_stars: null, favorite_roles: [] });
  } finally {
    await db.close();
  }
});

test("get_public_profile returns the new fields and nothing private", async (t) => {
  const db = await openDb();
  if (!db) {
    t.skip("install @electric-sql/pglite to run the database tests");
    return;
  }
  try {
    await db.exec(harness);
    await db.exec(read("supabase/schema-phase13.sql"));
    await db.exec(`update public.profiles set highest_rank = 'mythical_immortal', rank_stars = 160, favorite_roles = array['tank','mage'] where id = '${ann}'`);
    const profile = async (lookup: string) =>
      (await db.query(`select public.get_public_profile('${lookup}') as p`)).rows[0].p as Record<string, unknown> | null;

    const ann1 = await profile("ann");
    assert.ok(ann1);
    assert.equal(ann1.highest_rank, "mythical_immortal");
    assert.equal(ann1.rank_stars, 160);
    assert.deepEqual(ann1.favorite_roles, ["tank", "mage"]);
    // Looked up by id too, and the old fields are all still there.
    assert.equal((await profile(ann))?.username, "ann");
    for (const key of ["id", "display_name", "username", "avatar_url", "bio", "role_id", "country", "created_at", "is_own", "show_highlights",
      "show_following", "show_followers", "show_comments", "show_likes", "clips_count", "followers_count", "following_count"]) {
      assert.ok(key in ann1, key);
    }
    // Nothing private.
    for (const key of ["email", "zone_id", "clerk_user_id", "deletion_status"]) assert.equal(key in ann1, false, key);

    // A profile with nothing set: null, null, [].
    const ben1 = await profile("ben");
    assert.ok(ben1);
    assert.equal(ben1.highest_rank, null);
    assert.equal(ben1.rank_stars, null);
    assert.deepEqual(ben1.favorite_roles, []);

    // Deleted profiles are still not returned.
    await db.exec(`update public.profiles set deletion_status = 'pending_deletion' where id = '${ben}'`);
    assert.equal(await profile("ben"), null);
  } finally {
    await db.close();
  }
});
