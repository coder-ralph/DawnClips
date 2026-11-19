import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after } from "node:test";

/**
 * Follow back, remove follower, mute, restrict and the relationship lists, on a real Postgres engine (PGlite) running the
 * actual supabase/schema.sql. Calls are made as different signed-in people (role `authenticated` plus a Clerk-style JWT
 * subject), so RLS, grants and the SECURITY DEFINER functions are what is being tested. Skipped when PGlite is missing:
 *   npm i --no-save @electric-sql/pglite
 */

type Db = {
  exec: (sql: string) => Promise<unknown>;
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
  close: () => Promise<void>;
};

const schemaUrl = new URL("../supabase/schema.sql", import.meta.url);
const phase14Url = new URL("../supabase/schema-phase14.sql", import.meta.url);

let dbPromise: Promise<Db | null> | null = null;
function openDb(): Promise<Db | null> {
  dbPromise ??= (async () => {
    try {
      const name = "@electric-sql/pglite";
      const mod = (await import(name)) as { PGlite: new () => Db };
      const db = new mod.PGlite();
      await db.exec(`
        create role anon nologin; create role authenticated nologin; create role service_role nologin;
        create schema auth;
        create function auth.jwt() returns jsonb language sql stable as
          $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
        grant usage on schema auth to anon, authenticated;
      `);
      await db.exec(readFileSync(schemaUrl, "utf8").replace(/create extension if not exists pgcrypto;/g, ""));
      return db;
    } catch (error) {
      if (error instanceof Error && /Cannot find|ERR_MODULE_NOT_FOUND/.test(error.message)) return null;
      throw error;
    }
  })();
  return dbPromise;
}

after(async () => {
  const db = await dbPromise;
  await db?.close();
});

let counter = 0;
type User = { id: string; sub: string; username: string };

async function newUser(db: Db, name: string): Promise<User> {
  counter += 1;
  const username = `${name}${counter}`.toLowerCase();
  const sub = `user_${username}`;
  const { rows } = await db.query(
    "insert into public.profiles (clerk_user_id, display_name, username) values ($1, $2, $3) returning id",
    [sub, name, username],
  );
  return { id: rows[0].id as string, sub, username };
}

async function newClip(db: Db, owner: User, title = "Clip") {
  const { rows } = await db.query(
    "insert into public.clips (user_id, title, status, visibility) values ($1, $2, 'published', 'public') returning id",
    [owner.id, title],
  );
  return rows[0].id as string;
}

/** Runs `fn` as a signed-in person (or signed out when `sub` is null), like a PostgREST request. */
async function asUser<T>(db: Db, sub: string | null, fn: () => Promise<T>): Promise<T> {
  await db.query("select set_config('request.jwt.claims', $1, false)", [sub ? JSON.stringify({ sub }) : "{}"]);
  await db.exec(`set role ${sub ? "authenticated" : "anon"}`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
  }
}

async function rpc<T = Record<string, unknown>>(db: Db, who: User | null, call: string, params: unknown[] = []): Promise<T> {
  const { rows } = await asUser(db, who?.sub ?? null, () => db.query(`select public.${call} as r`, params));
  return rows[0].r as T;
}

async function fails(db: Db, who: User | null, call: string, params: unknown[], pattern: RegExp) {
  await assert.rejects(rpc(db, who, call, params), pattern);
}

type Person = { id: string; username: string; following: boolean; is_self: boolean };
type People = { people: Person[]; next_cursor: { created_at: string; id: string } | null };

const follow = (db: Db, who: User, target: User, should = true) => rpc(db, who, "set_follow($1::uuid, $2::boolean)", [target.id, should]);
const control = (db: Db, who: User, target: User, kind: "mute" | "restrict", enabled = true) =>
  rpc(db, who, "set_profile_control($1::uuid, $2, $3)", [target.id, kind, enabled]);
const notifications = async (db: Db, to: User, type?: string) =>
  Number((await db.query("select count(*)::int as n from public.notifications where recipient_id = $1 and ($2::text is null or type = $2)", [to.id, type ?? null])).rows[0].n);
const feedIds = async (db: Db, who: User, feed = "latest") => {
  const r = await rpc<{ clips: Array<{ id: string }> }>(db, who, "list_feed($1)", [feed]);
  return r.clips.map((clip) => clip.id);
};

async function withDb(t: test.TestContext, run: (db: Db) => Promise<void>) {
  const db = await openDb();
  if (!db) {
    t.skip("install @electric-sql/pglite to run the database tests");
    return;
  }
  await run(db);
}

test("schema.sql ends with phase 14 and the phase file is the same text", () => {
  const schema = readFileSync(schemaUrl, "utf8");
  const phase = readFileSync(phase14Url, "utf8");
  assert.ok(schema.trimEnd().endsWith(phase.trimEnd()), "schema.sql must end with schema-phase14.sql");
  assert.ok(schema.indexOf("DawnClips Phase 13") < schema.indexOf("DawnClips Phase 14"));
});

test("profile_controls: one row per person and kind, writes only through the function", async (t) => {
  await withDb(t, async (db) => {
    const [a, b, c] = [await newUser(db, "Ana"), await newUser(db, "Ben"), await newUser(db, "Cai")];
    assert.deepEqual(await control(db, a, b, "mute"), { control: "mute", enabled: true });
    await control(db, a, b, "mute"); // again: nothing new
    await control(db, a, b, "restrict");
    const rows = (await db.query("select kind from public.profile_controls where owner_id = $1 order by kind", [a.id])).rows;
    assert.deepEqual(rows.map((row) => row.kind), ["mute", "restrict"], "no duplicate row, and mute and restrict can coexist");

    await control(db, a, b, "mute", false);
    await control(db, a, b, "mute", false); // unmuting twice is harmless
    assert.equal((await db.query("select 1 from public.profile_controls where owner_id = $1 and kind = 'mute'", [a.id])).rows.length, 0);

    await fails(db, a, "set_profile_control($1::uuid, 'mute', true)", [a.id], /self action/);
    await fails(db, a, "set_profile_control($1::uuid, 'block', true)", [b.id], /invalid control/);
    await fails(db, a, "set_profile_control($1::uuid, 'mute', null)", [b.id], /invalid control/);
    await fails(db, a, "set_profile_control($1::uuid, 'mute', true)", ["00000000-0000-4000-8000-00000000dead"], /not allowed/);
    await fails(db, null, "set_profile_control($1::uuid, 'mute', true)", [b.id], /permission denied|unauthorized/);

    // Direct table writes are not possible for a signed-in person, and rows are private to their owner.
    for (const sql of [
      `insert into public.profile_controls (owner_id, target_id, kind) values ('${c.id}', '${b.id}', 'mute')`,
      `update public.profile_controls set kind = 'mute' where owner_id = '${a.id}'`,
      `delete from public.profile_controls where owner_id = '${a.id}'`,
    ]) {
      await assert.rejects(asUser(db, c.sub, () => db.query(sql)), /permission denied/);
    }
    const seen = await asUser(db, c.sub, () => db.query("select * from public.profile_controls"));
    assert.equal(seen.rows.length, 0, "Cai cannot see Ana's rows");
    const own = await asUser(db, a.sub, () => db.query("select * from public.profile_controls"));
    assert.equal(own.rows.length, 1, "Ana sees her own restrict row");
    // The CHECK constraints hold even for the table owner.
    await assert.rejects(db.query(`insert into public.profile_controls (owner_id, target_id, kind) values ('${a.id}', '${a.id}', 'mute')`), /profile_controls_no_self/);
    await assert.rejects(db.query(`insert into public.profile_controls (owner_id, target_id, kind) values ('${a.id}', '${c.id}', 'ignore')`), /profile_controls_kind_valid/);
  });
});

test("mute hides the author from feeds and related clips only, and nothing else", async (t) => {
  await withDb(t, async (db) => {
    const [me, author, other] = [await newUser(db, "Mia"), await newUser(db, "Author"), await newUser(db, "Other")];
    const mine = await newClip(db, author, "By the author");
    const theirs = await newClip(db, other, "By someone else");

    for (const feed of ["latest", "foryou", "trending"]) {
      const ids = await feedIds(db, me, feed);
      assert.ok(ids.includes(mine) && ids.includes(theirs), `${feed} shows both before muting`);
    }
    await follow(db, me, author);
    await control(db, me, author, "mute");
    for (const feed of ["latest", "foryou", "trending", "following"]) {
      const ids = await feedIds(db, me, feed);
      assert.ok(!ids.includes(mine), `${feed} hides the muted author, even though they are followed`);
    }
    assert.ok((await feedIds(db, me)).includes(theirs), "other authors are untouched");
    assert.ok((await feedIds(db, other)).includes(mine), "mute only changes the muter's view");
    assert.ok((await feedIds(db, null as unknown as User)).includes(mine), "signed-out viewers are untouched");

    const related = await rpc<Array<{ id: string }>>(db, me, "related_clips($1::uuid)", [theirs]);
    assert.ok(!related.some((clip) => clip.id === mine), "related clips skip the muted author");
    const sidebar = await rpc<{ creators: Array<{ username: string }> }>(db, me, "trending_sidebar()");
    assert.ok(!sidebar.creators.some((creator) => creator.username === author.username));

    // Everything else about the muted person stays as it was.
    assert.equal((await rpc(db, me, "profile_relationship($1::uuid)", [author.id])).following, true, "still following");
    const profile = await rpc<{ username: string } | null>(db, me, "get_public_profile($1)", [author.username]);
    assert.equal(profile?.username, author.username, "profile still opens");
    const activity = await rpc<Array<{ id: string }>>(db, me, "profile_activity($1::uuid, 'highlights')", [author.id]);
    assert.ok(activity.some((clip) => clip.id === mine), "their highlights tab still lists the clip");
    // The visibility check behind direct links and playback (internal function, so called as the table owner).
    const playable = (await db.query("select public.clip_is_visible($1::uuid, $2::uuid, true) as ok", [mine, me.id])).rows[0].ok;
    assert.equal(playable, true, "the clip is still reachable by link");
    await follow(db, author, me); // a muted person's follow still notifies
    assert.equal(await notifications(db, me, "follow"), 1, "mute does not silence notifications");

    await control(db, me, author, "mute", false);
    assert.ok((await feedIds(db, me)).includes(mine), "unmuting brings the clips back");
  });
});

test("restrict hides the restricted person's comments from others and silences their notifications", async (t) => {
  await withDb(t, async (db) => {
    const [owner, pest, friend] = [await newUser(db, "Owner"), await newUser(db, "Pest"), await newUser(db, "Friend")];
    const clip = await newClip(db, owner);
    const pestClip = await newClip(db, pest);
    assert.ok((await feedIds(db, owner)).includes(pestClip));

    await control(db, owner, pest, "restrict");
    assert.equal((await rpc(db, owner, "profile_relationship($1::uuid)", [pest.id])).restricted, true);

    const comment = await rpc<{ id: string }>(db, pest, "add_comment($1::uuid, null, $2)", [clip, "hello from the restricted one"]);
    await rpc(db, friend, "add_comment($1::uuid, null, $2)", [clip, "hello from a friend"]);
    const texts = async (who: User | null) => (await rpc<Array<{ content: string }>>(db, who, "list_comments($1::uuid)", [clip])).map((row) => row.content);

    assert.deepEqual(await texts(pest), ["hello from the restricted one", "hello from a friend"], "the restricted person still sees their own comment");
    assert.deepEqual(await texts(owner), ["hello from the restricted one", "hello from a friend"], "the restricter sees it too");
    assert.deepEqual(await texts(friend), ["hello from a friend"], "everyone else does not");
    assert.deepEqual(await texts(null), ["hello from a friend"], "nor do signed-out visitors");

    // Replies to the restricter's own comment on someone else's clip are hidden the same way.
    const otherClip = await newClip(db, friend);
    const root = await rpc<{ id: string }>(db, owner, "add_comment($1::uuid, null, $2)", [otherClip, "owner's comment"]);
    await rpc(db, pest, "add_comment($1::uuid, $2::uuid, $3)", [otherClip, root.id, "restricted reply"]);
    const replies = async (who: User) => (await rpc<Array<{ content: string }>>(db, who, "list_comments($1::uuid)", [otherClip])).map((row) => row.content);
    assert.deepEqual(await replies(friend), ["owner's comment"]);
    assert.deepEqual(await replies(owner), ["owner's comment", "restricted reply"]);
    assert.deepEqual(await replies(pest), ["owner's comment", "restricted reply"]);

    // Notifications: nothing from the restricted person reaches the restricter, others still do.
    assert.equal(await notifications(db, owner, "comment"), 1, "only the friend's comment notified");
    await rpc(db, pest, "set_like($1::uuid, true)", [clip]);
    assert.equal(await notifications(db, owner, "like"), 0, "a restricted like is silent");
    await follow(db, pest, owner);
    assert.equal(await notifications(db, owner, "follow"), 0, "a restricted follow is silent");
    await follow(db, friend, owner);
    assert.equal(await notifications(db, owner, "follow"), 1, "an ordinary follow still notifies");

    // Restricting is not blocking or unfollowing: the follow exists, feeds and profiles are unchanged.
    assert.equal((await rpc(db, pest, "profile_relationship($1::uuid)", [owner.id])).following, true);
    assert.ok((await feedIds(db, pest)).includes(clip), "the restricted person still sees the restricter's clips");
    assert.ok((await feedIds(db, owner)).includes(pestClip), "restrict is not mute: their clips still show in the restricter's feed");
    assert.equal((await rpc(db, owner, "get_public_profile($1)", [pest.username]))?.username, pest.username);
    assert.ok(comment.id);

    await control(db, owner, pest, "restrict", false);
    assert.deepEqual(await texts(friend), ["hello from the restricted one", "hello from a friend"], "unrestricting shows the comment again");
  });
});

test("blocking ends follows both ways and the blocker's own mute / restrict; unblocking restores nothing", async (t) => {
  await withDb(t, async (db) => {
    const [a, b, c] = [await newUser(db, "Ada"), await newUser(db, "Bo"), await newUser(db, "Cy")];
    await follow(db, a, b);
    await follow(db, b, a);
    await follow(db, a, c);
    await control(db, a, b, "mute");
    await control(db, a, b, "restrict");
    await control(db, b, a, "mute");

    // A block made through the table API (as the app does) fires the trigger.
    await asUser(db, a.sub, () => db.query("insert into public.blocks (blocker_id, blocked_id) values ($1, $2)", [a.id, b.id]));
    const follows = (await db.query("select follower_id, following_id from public.follows where $1 in (follower_id, following_id)", [a.id])).rows;
    assert.deepEqual(follows, [{ follower_id: a.id, following_id: c.id }], "only the unrelated follow survives");
    const controls = (await db.query("select owner_id, target_id from public.profile_controls where $1 in (owner_id, target_id)", [a.id])).rows;
    assert.deepEqual(controls, [{ owner_id: b.id, target_id: a.id }], "the blocker's rows go; the blocked person's own mute stays");

    await fails(db, a, "set_profile_control($1::uuid, 'mute', true)", [b.id], /not allowed/);
    await fails(db, b, "set_profile_control($1::uuid, 'restrict', true)", [a.id], /not allowed/);
    await fails(db, b, "set_follow($1::uuid, true)", [a.id], /not allowed|You cannot/);
    await control(db, b, a, "mute", false); // turning something off is always possible

    await asUser(db, a.sub, () => db.query("delete from public.blocks where blocker_id = $1", [a.id]));
    assert.equal((await rpc(db, a, "profile_relationship($1::uuid)", [b.id])).following, false, "unblocking does not bring the follow back");
    assert.equal((await rpc(db, a, "profile_relationship($1::uuid)", [b.id])).muted, false);
  });
});

test("remove follower deletes only the caller's follower and nothing else", async (t) => {
  await withDb(t, async (db) => {
    const [me, fan, bystander] = [await newUser(db, "Me"), await newUser(db, "Fan"), await newUser(db, "Bystander")];
    await follow(db, fan, me);
    await follow(db, bystander, me);
    await follow(db, me, fan); // I follow them back

    assert.deepEqual(await rpc(db, me, "profile_relationship($1::uuid)", [fan.id]), {
      following: true, followed_by: true, blocked: false, muted: false, restricted: false,
    });

    // Someone else cannot remove my follower: calling it as the bystander touches only the bystander's own followers.
    const attempt = await rpc(db, bystander, "remove_follower($1::uuid)", [fan.id]);
    assert.equal(attempt.removed, false, "the bystander has no such follower");
    assert.equal((await db.query("select 1 from public.follows where follower_id = $1 and following_id = $2", [fan.id, me.id])).rows.length, 1);
    await assert.rejects(asUser(db, bystander.sub, () => db.query("delete from public.follows where follower_id = $1", [fan.id])), /permission denied/);

    const result = await rpc(db, me, "remove_follower($1::uuid)", [fan.id]);
    assert.deepEqual(result, { removed: true, followers_count: 1 });
    assert.equal((await rpc(db, me, "profile_relationship($1::uuid)", [fan.id])).followed_by, false);
    assert.equal((await rpc(db, me, "profile_relationship($1::uuid)", [fan.id])).following, true, "my follow of them is untouched");
    assert.equal((await db.query("select 1 from public.blocks where blocker_id = $1", [me.id])).rows.length, 0, "no block");
    assert.equal((await db.query("select 1 from public.profile_controls where owner_id = $1", [me.id])).rows.length, 0, "no restrict or mute");
    assert.equal((await rpc(db, me, "remove_follower($1::uuid)", [fan.id])).removed, false, "second call is a no-op");
    await follow(db, fan, me); // they may follow again
    assert.equal((await rpc(db, me, "profile_relationship($1::uuid)", [fan.id])).followed_by, true);

    await fails(db, me, "remove_follower($1::uuid)", [me.id], /self action/);
    await fails(db, null, "remove_follower($1::uuid)", [fan.id], /permission denied|unauthorized/);
  });
});

test("followers and following lists: complete, paginated, with the viewer's own follow state", async (t) => {
  await withDb(t, async (db) => {
    const [star, viewer, stranger] = [await newUser(db, "Star"), await newUser(db, "Viewer"), await newUser(db, "Stranger")];
    const fans: User[] = [];
    for (let i = 0; i < 31; i += 1) fans.push(await newUser(db, `Fan${i}`));
    for (const fan of fans) await follow(db, fan, star);
    for (const fan of fans) await follow(db, star, fan); // star follows 31 people too (more than any old page limit)
    await follow(db, viewer, fans[0]);
    await follow(db, viewer, fans[1]);

    const all = async (who: User | null, kind: string) => {
      const seen: Person[] = [];
      let cursor: People["next_cursor"] = null;
      for (let guard = 0; guard < 20; guard += 1) {
        const page: People = await rpc<People>(db, who, "list_profile_people($1::uuid, $2, $3::timestamptz, $4::uuid, 10)", [star.id, kind, cursor?.created_at ?? null, cursor?.id ?? null]);
        assert.ok(page.people.length <= 10);
        seen.push(...page.people);
        cursor = page.next_cursor;
        if (!cursor) return seen;
      }
      throw new Error("pagination did not end");
    };

    for (const kind of ["followers", "following"]) {
      const list = await all(viewer, kind);
      assert.equal(list.length, 31, `${kind}: every profile, none skipped or repeated across pages`);
      assert.equal(new Set(list.map((p) => p.id)).size, 31);
      const byId = new Map(list.map((p) => [p.id, p]));
      assert.equal(byId.get(fans[0].id)?.following, true, "viewer follows fan 0");
      assert.equal(byId.get(fans[1].id)?.following, true);
      assert.equal(byId.get(fans[2].id)?.following, false, "viewer does not follow fan 2: this is the Follow back case");
      assert.ok(list.every((p) => !p.is_self));
    }
    // Newest first: the last follower to arrive is the first row.
    assert.equal((await all(viewer, "followers"))[0].id, fans[30].id);

    // The viewer sees their own row flagged, and signed-out visitors get plain rows.
    await follow(db, viewer, star);
    const withSelf = await all(stranger, "followers");
    assert.equal(withSelf.length, 32);
    assert.equal((await all(viewer, "followers")).find((p) => p.id === viewer.id)?.is_self, true);
    assert.ok((await all(null, "followers")).every((p) => p.following === false));

    // Privacy settings still apply, except for the owner; blocked people are left out.
    await db.query("update public.profile_settings set show_followers = false where profile_id = $1", [star.id]);
    assert.equal((await all(stranger, "followers")).length, 0, "hidden follower list stays hidden");
    assert.equal((await all(star, "followers")).length, 32, "but the owner sees it");
    await db.query("update public.profile_settings set show_followers = true where profile_id = $1", [star.id]);
    await asUser(db, stranger.sub, () => db.query("insert into public.blocks (blocker_id, blocked_id) values ($1, $2)", [stranger.id, fans[5].id]));
    assert.ok(!(await all(stranger, "followers")).some((p) => p.id === fans[5].id), "a blocked profile is not listed");

    await fails(db, viewer, "list_profile_people($1::uuid, 'friends')", [star.id], /invalid kind/);
    assert.deepEqual(await rpc(db, viewer, "list_profile_people($1::uuid, 'followers', null, null, 5)", ["00000000-0000-4000-8000-00000000dead"]), { people: [], next_cursor: null });
  });
});

test("blocked / muted / restricted lists belong to their owner", async (t) => {
  await withDb(t, async (db) => {
    const [me, other] = [await newUser(db, "Lister"), await newUser(db, "Nosy")];
    const targets: User[] = [];
    for (let i = 0; i < 7; i += 1) targets.push(await newUser(db, `T${i}`));

    for (const target of targets.slice(0, 5)) await control(db, me, target, "mute");
    await control(db, me, targets[5], "restrict");
    await asUser(db, me.sub, () => db.query("insert into public.blocks (blocker_id, blocked_id) values ($1, $2)", [me.id, targets[6].id]));
    await control(db, other, targets[0], "mute"); // someone else's mute must never show up in mine

    const list = async (who: User, kind: string) => {
      const out: Array<{ id: string; username: string }> = [];
      type Cursor = { created_at: string; id: string } | null;
      let cursor = null as Cursor;
      for (let guard = 0; guard < 10; guard += 1) {
        const page: { people: Array<{ id: string; username: string }>; next_cursor: Cursor } = await rpc(db, who, "list_relationship_profiles($1, $2::timestamptz, $3::uuid, 2)", [kind, cursor?.created_at ?? null, cursor?.id ?? null]);
        out.push(...page.people);
        cursor = page.next_cursor;
        if (!cursor) return out;
      }
      throw new Error("pagination did not end");
    };

    assert.deepEqual((await list(me, "muted")).map((p) => p.id).sort(), targets.slice(0, 5).map((p) => p.id).sort(), "all five, across pages");
    assert.deepEqual((await list(me, "restricted")).map((p) => p.id), [targets[5].id]);
    assert.deepEqual((await list(me, "blocked")).map((p) => p.id), [targets[6].id]);
    assert.deepEqual((await list(other, "muted")).map((p) => p.id), [targets[0].id], "each person only sees their own list");
    assert.deepEqual(await list(other, "blocked"), []);

    // Unmuting takes the person off the list; an account being deleted is not listed.
    await control(db, me, targets[0], "mute", false);
    assert.equal((await list(me, "muted")).length, 4);
    await db.query("update public.profiles set deletion_status = 'pending_deletion' where id = $1", [targets[1].id]);
    assert.equal((await list(me, "muted")).length, 3);

    await fails(db, me, "list_relationship_profiles('followers')", [], /invalid kind/);
    await fails(db, null, "list_relationship_profiles('muted')", [], /permission denied|unauthorized/);
  });
});

test("viewer_clip_flags reports muted and restricted for the clip's author", async (t) => {
  await withDb(t, async (db) => {
    const [me, author] = [await newUser(db, "Flagger"), await newUser(db, "Flagged")];
    const clip = await newClip(db, author);
    const flags = async () => (await rpc<Record<string, Record<string, boolean>>>(db, me, "viewer_clip_flags(array[$1::uuid])", [clip]))[clip];
    assert.deepEqual(await flags(), { liked: false, bookmarked: false, following: false, muted: false, restricted: false });
    await follow(db, me, author);
    await control(db, me, author, "mute");
    await control(db, me, author, "restrict");
    assert.deepEqual(await flags(), { liked: false, bookmarked: false, following: true, muted: true, restricted: true });
  });
});

test("the phase 14 file can be run again without errors or data changes", async (t) => {
  await withDb(t, async (db) => {
    const [a, b] = [await newUser(db, "Again"), await newUser(db, "Twice")];
    await follow(db, a, b);
    await control(db, a, b, "mute");
    await db.exec(readFileSync(phase14Url, "utf8"));
    assert.equal((await rpc(db, a, "profile_relationship($1::uuid)", [b.id])).following, true);
    assert.equal((await rpc(db, a, "profile_relationship($1::uuid)", [b.id])).muted, true);
  });
});
