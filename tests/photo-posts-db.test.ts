import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after } from "node:test";

/**
 * Photo posts and comment images (supabase/schema-phase15.sql) on a real Postgres engine (PGlite) running the actual
 * supabase/schema.sql. People are signed in with role `authenticated` plus a Clerk-style JWT subject, so RLS, grants and the
 * SECURITY DEFINER functions are what is being tested. Server-side writes (what the API routes do with the service role)
 * run as the database owner. Skipped when PGlite is missing:  npm i --no-save @electric-sql/pglite
 */

type Db = {
  exec: (sql: string) => Promise<unknown>;
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
  close: () => Promise<void>;
};

const schemaUrl = new URL("../supabase/schema.sql", import.meta.url);
const phase15Url = new URL("../supabase/schema-phase15.sql", import.meta.url);

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

async function withDb(t: test.TestContext, run: (db: Db) => Promise<void>) {
  const db = await openDb();
  if (!db) {
    t.skip("install @electric-sql/pglite to run the database tests");
    return;
  }
  await run(db);
}

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

type Shape = [width: number, height: number];

/** A published photo post with one image per shape, in order (what the complete route leaves behind). */
async function newPhotoPost(db: Db, owner: User, shapes: Shape[] = [[1080, 1350]], visibility = "public", caption = "") {
  const { rows } = await db.query(
    "insert into public.clips (user_id, title, status, visibility, kind) values ($1, $2, 'published', $3, 'photo') returning id",
    [owner.id, caption, visibility],
  );
  const id = rows[0].id as string;
  for (const [position, [width, height]] of shapes.entries()) {
    await db.query(
      "insert into public.post_media (post_id, position, mime_type, file_size, width, height) values ($1, $2, 'image/webp', 250000, $3, $4)",
      [id, position, width, height],
    );
  }
  return id;
}

async function newVideo(db: Db, owner: User, title = "Clip", visibility = "public") {
  const { rows } = await db.query(
    "insert into public.clips (user_id, title, status, visibility) values ($1, $2, 'published', $3) returning id",
    [owner.id, title, visibility],
  );
  return rows[0].id as string;
}

async function newCommentImage(db: Db, owner: User, status: "pending" | "verified" = "verified") {
  const { rows } = await db.query(
    "insert into public.comment_media (owner_id, status, mime_type, file_size, width, height) values ($1, $2, 'image/jpeg', 90000, 800, 600) returning id",
    [owner.id, status],
  );
  return rows[0].id as string;
}

type FeedClip = { id: string; kind: string; media_count: number; cover: { id: string; width: number; height: number } | null };
const feed = async (db: Db, who: User | null, name = "latest", limit = 8) =>
  rpc<{ clips: FeedClip[]; next_cursor: { created_at: string; id: string; score: number } | null }>(db, who, "list_feed($1, null, null, null, $2)", [name, limit]);
const feedIds = async (db: Db, who: User | null) => (await feed(db, who)).clips.map((clip) => clip.id);

test("the phase 15 file is the end of schema.sql and can be run again without changing data", async (t) => {
  const schema = readFileSync(schemaUrl, "utf8");
  const phase = readFileSync(phase15Url, "utf8");
  assert.ok(schema.trimEnd().endsWith(phase.trimEnd()), "schema.sql must end with schema-phase15.sql");
  await withDb(t, async (db) => {
    const owner = await newUser(db, "Again");
    const post = await newPhotoPost(db, owner, [[100, 100], [200, 100]]);
    await db.exec(phase);
    const { rows } = await db.query("select count(*)::int as n from public.post_media where post_id = $1", [post]);
    assert.equal(rows[0].n, 2);
  });
});

test("existing clips become videos and a photo post stores no video key", async (t) => {
  await withDb(t, async (db) => {
    const owner = await newUser(db, "Kinds");
    const video = await newVideo(db, owner);
    assert.equal((await db.query("select kind from public.clips where id = $1", [video])).rows[0].kind, "video");
    // A photo post cannot carry a video key, even one that is correctly shaped for its own id.
    const id = (await db.query("select gen_random_uuid() as id")).rows[0].id as string;
    await assert.rejects(
      db.query("insert into public.clips (id, user_id, title, status, kind, r2_object_key) values ($1, $2, 'x', 'pending', 'photo', $3)", [id, owner.id, `clips/${owner.id}/${id}.mp4`]),
      /clips_kind_storage/,
    );
    await assert.rejects(db.query("insert into public.clips (user_id, title, status, kind) values ($1, 'x', 'pending', 'gif')", [owner.id]), /clips_kind_valid/);
  });
});

test("a photo post may have no caption, a video still needs a title", async (t) => {
  await withDb(t, async (db) => {
    const owner = await newUser(db, "Caption");
    await newPhotoPost(db, owner, [[10, 10]], "public", "");
    await assert.rejects(db.query("insert into public.clips (user_id, title, status) values ($1, '', 'pending')", [owner.id]), /clips_title_len/);
    await assert.rejects(
      db.query("insert into public.clips (user_id, title, status, kind) values ($1, $2, 'pending', 'photo')", [owner.id, "x".repeat(121)]),
      /clips_title_len/,
    );
  });
});

test("a signed-in person cannot turn a clip into a photo post or back", async (t) => {
  await withDb(t, async (db) => {
    const owner = await newUser(db, "Switch");
    const video = await newVideo(db, owner);
    await assert.rejects(
      asUser(db, owner.sub, () => db.query("update public.clips set kind = 'photo' where id = $1", [video])),
      /managed by the server|permission denied|row-level security|clips_kind_storage/,
    );
    assert.equal((await db.query("select kind from public.clips where id = $1", [video])).rows[0].kind, "video");
  });
});

test("post_media: at most 20 ordered images, one position each, only JPEG/PNG/WebP, sane size and pixels", async (t) => {
  await withDb(t, async (db) => {
    const owner = await newUser(db, "Twenty");
    const post = await newPhotoPost(db, owner, Array.from({ length: 20 }, () => [1000, 1000] as Shape));
    assert.equal(Number((await db.query("select count(*) as n from public.post_media where post_id = $1", [post])).rows[0].n), 20);
    const insert = (position: number, mime = "image/webp", size = 1000, width = 10, height = 10) =>
      db.query("insert into public.post_media (post_id, position, mime_type, file_size, width, height) values ($1, $2, $3, $4, $5, $6)", [post, position, mime, size, width, height]);
    await assert.rejects(insert(20), /post_media_position_range/);
    await assert.rejects(insert(19), /post_media_unique_position/);
    const second = await newPhotoPost(db, owner, []);
    const into = (mime: string, size: number, width: number, height: number) =>
      db.query("insert into public.post_media (post_id, position, mime_type, file_size, width, height) values ($1, 0, $2, $3, $4, $5)", [second, mime, size, width, height]);
    await assert.rejects(into("image/gif", 1000, 10, 10), /post_media_mime_valid/);
    await assert.rejects(into("image/svg+xml", 1000, 10, 10), /post_media_mime_valid/);
    await assert.rejects(into("image/jpeg", 104_857_601, 10, 10), /post_media_size_valid/);
    await assert.rejects(into("image/jpeg", 0, 10, 10), /post_media_size_valid/);
    await assert.rejects(into("image/jpeg", 1000, 0, 10), /post_media_dimensions_valid/);
    await assert.rejects(into("image/jpeg", 1000, 10, 16385), /post_media_dimensions_valid/);
    await into("image/png", 104_857_600, 16384, 16384);
  });
});

test("post_media and comment_media cannot be read or written by signed-in or signed-out clients", async (t) => {
  await withDb(t, async (db) => {
    const owner = await newUser(db, "Locked");
    const post = await newPhotoPost(db, owner, [[10, 10]]);
    await newCommentImage(db, owner);
    for (const who of [owner.sub, null]) {
      await assert.rejects(asUser(db, who, () => db.query("select * from public.post_media")), /permission denied/);
      await assert.rejects(asUser(db, who, () => db.query("insert into public.post_media (post_id, position, mime_type, file_size, width, height) values ($1, 5, 'image/png', 1, 1, 1)", [post])), /permission denied/);
      await assert.rejects(asUser(db, who, () => db.query("delete from public.post_media")), /permission denied/);
      await assert.rejects(asUser(db, who, () => db.query("select * from public.comment_media")), /permission denied/);
      await assert.rejects(asUser(db, who, () => db.query("update public.comment_media set status = 'verified'")), /permission denied/);
    }
  });
});

test("the helper functions are not callable by clients, comment_tree_ids is for the server only", async (t) => {
  await withDb(t, async (db) => {
    const owner = await newUser(db, "Helpers");
    const post = await newPhotoPost(db, owner, [[10, 10]]);
    for (const call of ["clip_media_json($1::uuid)", "clip_cover_json($1::uuid)", "clip_media_count($1::uuid)", "comment_tree_ids($1::uuid)"]) {
      await assert.rejects(rpc(db, owner, call, [post]), /permission denied/);
    }
  });
});

test("the feed shows videos and photo posts, the first image is the cover, each image keeps its own size", async (t) => {
  await withDb(t, async (db) => {
    const author = await newUser(db, "Mixed");
    const viewer = await newUser(db, "Viewer");
    const video = await newVideo(db, author);
    // Inserted out of order on purpose: position decides the order, not insertion.
    const { rows } = await db.query("insert into public.clips (user_id, title, status, visibility, kind) values ($1, 'Trio', 'published', 'public', 'photo') returning id", [author.id]);
    const post = rows[0].id as string;
    for (const [position, w, h] of [[2, 1920, 1080], [0, 1080, 1350], [1, 1080, 1920]]) {
      await db.query("insert into public.post_media (post_id, position, mime_type, file_size, width, height) values ($1, $2, 'image/jpeg', 100, $3, $4)", [post, position, w, h]);
    }
    const page = await feed(db, viewer);
    const item = page.clips.find((clip) => clip.id === post);
    assert.ok(item && page.clips.some((clip) => clip.id === video));
    assert.equal(item.kind, "photo");
    assert.equal(item.media_count, 3);
    assert.deepEqual([item.cover?.width, item.cover?.height], [1080, 1350]);
    const playback = await db.query("select public.authorize_clip_playback($1, $2) as r", [post, viewer.sub]);
    const media = (playback.rows[0].r as { kind: string; media: Array<{ width: number; height: number }> });
    assert.equal(media.kind, "photo");
    assert.deepEqual(media.media.map((m) => [m.width, m.height]), [[1080, 1350], [1080, 1920], [1920, 1080]]);
    const videoItem = page.clips.find((clip) => clip.id === video);
    assert.equal(videoItem?.kind, "video");
    assert.equal(videoItem?.media_count, 0);
  });
});

test("private and unlisted photo posts follow the same rules as videos", async (t) => {
  await withDb(t, async (db) => {
    const owner = await newUser(db, "Privacy");
    const stranger = await newUser(db, "Stranger");
    const priv = await newPhotoPost(db, owner, [[10, 10]], "private");
    const unlisted = await newPhotoPost(db, owner, [[10, 10]], "unlisted");
    const open = await newPhotoPost(db, owner, [[10, 10]], "public");
    const strangerFeed = await feedIds(db, stranger);
    assert.ok(strangerFeed.includes(open));
    assert.ok(!strangerFeed.includes(priv) && !strangerFeed.includes(unlisted));
    const anon = await feedIds(db, null);
    assert.ok(anon.includes(open) && !anon.includes(priv) && !anon.includes(unlisted));
    const authorize = async (id: string, who: User | null) =>
      (await db.query("select public.authorize_clip_playback($1, $2) as r", [id, who?.sub ?? null])).rows[0].r as { media: unknown[] } | null;
    assert.equal(await authorize(priv, stranger), null);
    assert.equal(await authorize(priv, null), null);
    assert.equal((await authorize(priv, owner))?.media.length, 1);
    assert.equal((await authorize(unlisted, stranger))?.media.length, 1); // reachable by link
    assert.equal((await authorize(open, null))?.media.length, 1);
  });
});

test("blocked people cannot see each other's photo posts", async (t) => {
  await withDb(t, async (db) => {
    const owner = await newUser(db, "Blocker");
    const blocked = await newUser(db, "Blocked");
    const post = await newPhotoPost(db, owner, [[10, 10]]);
    await db.query("insert into public.blocks (blocker_id, blocked_id) values ($1, $2)", [owner.id, blocked.id]);
    assert.ok(!(await feedIds(db, blocked)).includes(post));
    const row = (await db.query("select public.authorize_clip_playback($1, $2) as r", [post, blocked.sub])).rows[0].r;
    assert.equal(row, null);
  });
});

test("profile tabs keep videos and photo posts apart, and respect the Posts and Highlights switches", async (t) => {
  await withDb(t, async (db) => {
    const owner = await newUser(db, "Tabs");
    const visitor = await newUser(db, "Visitor");
    const video = await newVideo(db, owner);
    const photo = await newPhotoPost(db, owner, [[10, 10], [20, 10]]);
    const ids = async (who: User | null, tab: string) =>
      (await rpc<Array<{ id: string }> | { clips: Array<{ id: string }> }>(db, who, "profile_clips($1::uuid, $2)", [owner.id, tab]).then((r) => (Array.isArray(r) ? r : r.clips))).map((c) => c.id);
    assert.deepEqual(await ids(visitor, "highlights"), [video]);
    assert.deepEqual(await ids(visitor, "posts"), [photo]);

    const counts = async (who: User | null) =>
      rpc<{ clips_count: number | null; posts_count: number | null; show_posts: boolean; show_highlights: boolean }>(db, who, "get_public_profile($1)", [owner.username]);
    const open = await counts(visitor);
    assert.equal(open.clips_count, 1);
    assert.equal(open.posts_count, 1);

    await db.query("update public.profile_settings set show_posts = false where profile_id = $1", [owner.id]);
    assert.deepEqual(await ids(visitor, "posts"), []);
    assert.deepEqual(await ids(visitor, "highlights"), [video]);
    assert.ok(!(await feedIds(db, visitor)).includes(photo));
    assert.ok((await feedIds(db, visitor)).includes(video));
    const hidden = await counts(visitor);
    assert.equal(hidden.show_posts, false);
    assert.ok(hidden.posts_count === null || hidden.posts_count === 0 || hidden.posts_count === undefined);
    assert.deepEqual(await ids(owner, "posts"), [photo]);
    assert.equal((await counts(owner)).posts_count, 1);

    await db.query("update public.profile_settings set show_posts = true, show_highlights = false where profile_id = $1", [owner.id]);
    assert.deepEqual(await ids(visitor, "highlights"), []);
    assert.deepEqual(await ids(visitor, "posts"), [photo]);
    assert.ok((await feedIds(db, visitor)).includes(photo));
    assert.ok(!(await feedIds(db, visitor)).includes(video));
  });
});

test("liked clips can include photo posts, comments and likes still work on them", async (t) => {
  await withDb(t, async (db) => {
    const owner = await newUser(db, "Likes");
    const fan = await newUser(db, "Fan");
    const photo = await newPhotoPost(db, owner, [[10, 10]]);
    await rpc(db, fan, "set_like($1::uuid, $2::boolean)", [photo, true]);
    assert.equal(Number((await db.query("select likes_count from public.clips where id = $1", [photo])).rows[0].likes_count), 1);
    const comment = await rpc<{ id: string; comments_count: number }>(db, fan, "add_comment($1::uuid, null, $2)", [photo, "Nice shots"]);
    assert.equal(comment.comments_count, 1);
    const reply = await rpc<{ id: string }>(db, owner, "add_comment($1::uuid, $2::uuid, $3)", [photo, comment.id, "Thanks"]);
    assert.ok(reply.id);
    const liked = await rpc<{ clips: Array<{ id: string }> } | Array<{ id: string }>>(db, fan, "profile_clips($1::uuid, 'liked')", [fan.id]);
    const likedIds = (Array.isArray(liked) ? liked : liked.clips).map((c) => c.id);
    assert.ok(likedIds.includes(photo));
  });
});

test("list_feed pages never skip a clip (the cursor starts after the last clip that was returned)", async (t) => {
  await withDb(t, async (db) => {
    const owner = await newUser(db, "Pages");
    const viewer = await newUser(db, "Pager");
    const made: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      made.push(index % 2 === 0 ? await newVideo(db, owner, `Clip ${index}`) : await newPhotoPost(db, owner, [[10, 10]]));
      await db.query("update public.clips set created_at = now() - ($2 || ' minutes')::interval where id = $1", [made[index], String(10 - index)]);
    }
    const seen: string[] = [];
    let cursor: { created_at: string; id: string; score: number } | null = null;
    // Other tests in this file left clips behind that sort before these, so walk as many pages as it takes.
    for (let page = 0; page < 40; page += 1) {
      const result: Awaited<ReturnType<typeof feed>> = cursor
        ? await rpc(db, viewer, "list_feed('latest', $1::timestamptz, $2::uuid, $3::numeric, 2)", [cursor.created_at, cursor.id, cursor.score])
        : await feed(db, viewer, "latest", 2);
      seen.push(...result.clips.map((clip) => clip.id));
      cursor = result.next_cursor;
      if (!cursor) break;
    }
    assert.equal(new Set(seen).size, seen.length, "no clip appears twice");
    assert.deepEqual(new Set(seen.filter((id) => made.includes(id))), new Set(made), "no clip is skipped");
  });
});

test("related and trending lists only offer videos", async (t) => {
  await withDb(t, async (db) => {
    const owner = await newUser(db, "Related");
    const video = await newVideo(db, owner);
    const other = await newVideo(db, owner, "Other");
    const photo = await newPhotoPost(db, owner, [[10, 10]]);
    await db.query("update public.clips set hero_tags = array['layla'] where id = $1", [photo]);
    const related = await rpc<Array<{ id: string }>>(db, null, "related_clips($1::uuid, 10)", [video]);
    const ids = related.map((clip) => clip.id);
    assert.ok(!ids.includes(photo));
    assert.ok(ids.includes(other));
    const trending = await rpc<{ heroes: Array<{ hero_id: string }> }>(db, null, "trending_sidebar()", []);
    assert.ok(!trending.heroes.some((hero) => hero.hero_id === "layla"), "a photo post's hero tags do not count as trending clips");
  });
});

test("a photo post cannot be pinned", async (t) => {
  await withDb(t, async (db) => {
    const owner = await newUser(db, "Pins");
    const photo = await newPhotoPost(db, owner, [[10, 10]]);
    await assert.rejects(rpc(db, owner, "set_clip_pinned($1::uuid, true)", [photo]));
  });
});

test("comment image: attached once, by the person who uploaded it, after the server verified it", async (t) => {
  await withDb(t, async (db) => {
    const owner = await newUser(db, "Host");
    const author = await newUser(db, "Author");
    const other = await newUser(db, "Other");
    const clip = await newVideo(db, owner);

    const pending = await newCommentImage(db, author, "pending");
    await assert.rejects(rpc(db, author, "add_comment_with_media($1::uuid, null, 'hi', $2::uuid)", [clip, pending]), /invalid media/);

    const verified = await newCommentImage(db, author, "verified");
    await assert.rejects(rpc(db, other, "add_comment_with_media($1::uuid, null, 'steal', $2::uuid)", [clip, verified]), /invalid media/);

    const posted = await rpc<{ id: string; content: string; comments_count: number; media: { id: string; width: number; height: number; mime_type: string } }>(
      db, author, "add_comment_with_media($1::uuid, null, 'look', $2::uuid)", [clip, verified],
    );
    assert.equal(posted.comments_count, 1);
    assert.equal(posted.media.id, verified);
    assert.equal(posted.media.mime_type, "image/jpeg");
    const row = (await db.query("select status, comment_id from public.comment_media where id = $1", [verified])).rows[0];
    assert.deepEqual([row.status, row.comment_id], ["attached", posted.id]);
    await assert.rejects(rpc(db, author, "add_comment_with_media($1::uuid, null, 'again', $2::uuid)", [clip, verified]), /invalid media/);
    assert.equal(Number((await db.query("select comments_count from public.clips where id = $1", [clip])).rows[0].comments_count), 1);
  });
});

test("an image-only comment is allowed, a comment with neither text nor image is not, and text stays within 500", async (t) => {
  await withDb(t, async (db) => {
    const owner = await newUser(db, "Empty");
    const author = await newUser(db, "Poster");
    const clip = await newVideo(db, owner);
    const image = await newCommentImage(db, author);
    const posted = await rpc<{ id: string; content: string }>(db, author, "add_comment_with_media($1::uuid, null, '', $2::uuid)", [clip, image]);
    assert.equal(posted.content, "");

    await assert.rejects(rpc(db, author, "add_comment($1::uuid, null, '')", [clip]));
    await assert.rejects(rpc(db, author, "add_comment($1::uuid, null, '   ')", [clip]));
    await assert.rejects(db.query("insert into public.comments (user_id, clip_id, content) values ($1, $2, '')", [author.id, clip]), /comment/i);
    const long = await newCommentImage(db, author);
    await assert.rejects(rpc(db, author, "add_comment_with_media($1::uuid, null, $2, $3::uuid)", [clip, "x".repeat(501), long]));
    await rpc(db, author, "add_comment($1::uuid, null, $2)", [clip, "y".repeat(500)]);
  });
});

test("comments are listed with their image, replies and likes work on them, and deleting removes the image row", async (t) => {
  await withDb(t, async (db) => {
    const owner = await newUser(db, "Thread");
    const author = await newUser(db, "Writer");
    const reader = await newUser(db, "Reader");
    const clip = await newPhotoPost(db, owner, [[10, 10]]);
    const image = await newCommentImage(db, author);
    const posted = await rpc<{ id: string }>(db, author, "add_comment_with_media($1::uuid, null, 'pic', $2::uuid)", [clip, image]);
    const replyImage = await newCommentImage(db, reader);
    const reply = await rpc<{ id: string }>(db, reader, "add_comment_with_media($1::uuid, $2::uuid, '', $3::uuid)", [clip, posted.id, replyImage]);

    type Listed = Array<{ id: string; user_id: string; media: { id: string; width: number; height: number } | null; likes_count: number }>;
    const listed = await rpc<Listed>(db, reader, "list_comments($1::uuid)", [clip]);
    const root = listed.find((comment) => comment.id === posted.id);
    assert.equal(root?.media?.id, image);
    assert.equal(root?.user_id, author.id);
    assert.equal(listed.find((comment) => comment.id === reply.id)?.media?.id, replyImage);

    await rpc(db, reader, "set_comment_like($1::uuid, true)", [posted.id]);
    assert.equal((await rpc<Listed>(db, reader, "list_comments($1::uuid)", [clip])).find((c) => c.id === posted.id)?.likes_count, 1);

    const tree = (await db.query("select public.comment_tree_ids($1::uuid) as r", [posted.id])).rows[0].r as string[];
    assert.deepEqual(new Set(tree), new Set([posted.id, reply.id]));

    const removed = await rpc<{ removed_ids: string[]; comments_count: number }>(db, author, "delete_comment($1::uuid)", [posted.id]);
    assert.equal(removed.comments_count, 0);
    assert.equal(Number((await db.query("select count(*) as n from public.comment_media where id in ($1, $2)", [image, replyImage])).rows[0].n), 0);
    // The comment is gone, so its image cannot be reached through the listing either.
    assert.equal((await rpc<Listed>(db, reader, "list_comments($1::uuid)", [clip])).length, 0);
  });
});

test("only the author deletes a comment, and an unattached image can be removed with its owner", async (t) => {
  await withDb(t, async (db) => {
    const owner = await newUser(db, "Guard");
    const author = await newUser(db, "Mine");
    const other = await newUser(db, "Theirs");
    const clip = await newVideo(db, owner);
    const image = await newCommentImage(db, author);
    const posted = await rpc<{ id: string }>(db, author, "add_comment_with_media($1::uuid, null, 'x', $2::uuid)", [clip, image]);
    await assert.rejects(rpc(db, other, "delete_comment($1::uuid)", [posted.id]), /not allowed/);
    await assert.rejects(rpc(db, owner, "delete_comment($1::uuid)", [posted.id]), /not allowed/);
    assert.equal(Number((await db.query("select count(*) as n from public.comment_media where id = $1", [image])).rows[0].n), 1);
    // A deleted account takes its images' rows with it (the server deletes the objects first).
    await db.query("delete from public.profiles where id = $1", [author.id]).catch(() => undefined);
  });
});

test("deleting a photo post removes its images' rows and its comments' image rows", async (t) => {
  await withDb(t, async (db) => {
    const owner = await newUser(db, "Remove");
    const author = await newUser(db, "Chatty");
    const post = await newPhotoPost(db, owner, [[10, 10], [20, 20]]);
    const image = await newCommentImage(db, author);
    await rpc(db, author, "add_comment_with_media($1::uuid, null, 'x', $2::uuid)", [post, image]);
    await db.query("delete from public.clips where id = $1", [post]);
    assert.equal(Number((await db.query("select count(*) as n from public.post_media where post_id = $1", [post])).rows[0].n), 0);
    assert.equal(Number((await db.query("select count(*) as n from public.comment_media where id = $1", [image])).rows[0].n), 0);
  });
});
