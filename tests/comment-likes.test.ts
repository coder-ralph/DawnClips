import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { commentLikeLabel } from "../lib/a11y-labels";
import { withLike, withLikeDefaults, withLikeState } from "../lib/comment-likes";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const make = (id: string, liked = false, likes_count = 0) => ({ id, liked, likes_count });

test("liking and unliking moves one comment's count by one and touches nothing else", () => {
  const list = [make("a", false, 2), make("b", true, 5)];
  assert.deepEqual(withLike(list, "a", true), [make("a", true, 3), make("b", true, 5)]);
  assert.deepEqual(withLike(list, "b", false), [make("a", false, 2), make("b", false, 4)]);
  // Already in that state: unchanged, so a repeated click cannot double count.
  assert.deepEqual(withLike(list, "a", false), list);
  assert.deepEqual(withLike(list, "b", true), list);
  // Never below zero.
  assert.equal(withLike([make("c", true, 0)], "c", false)[0].likes_count, 0);
  assert.deepEqual(withLike(list, "missing", true), list);
});

test("a failed like puts back that comment's previous state only", () => {
  const before = [make("a", false, 2), make("b", true, 5)];
  const optimistic = withLike(before, "a", true);
  // Meanwhile the other comment changed; the rollback must not undo that.
  const meanwhile = withLike(optimistic, "b", false);
  const rolledBack = withLikeState(meanwhile, "a", { liked: false, likes_count: 2 });
  assert.deepEqual(rolledBack, [make("a", false, 2), make("b", false, 4)]);
  assert.equal(withLikeState([make("a")], "a", { liked: true, likes_count: -3 })[0].likes_count, 0);
});

test("comments from a server without like fields read as not liked, zero likes", () => {
  assert.deepEqual(withLikeDefaults({ id: "x" }), { id: "x", liked: false, likes_count: 0 });
  assert.deepEqual(withLikeDefaults({ id: "x", liked: true, likes_count: "4" }), { id: "x", liked: true, likes_count: 4 });
});

test("like labels follow the state", () => {
  assert.equal(commentLikeLabel(false), "Like comment");
  assert.equal(commentLikeLabel(true), "Unlike comment");
});

test("the like route is signed-in only, validated, rate limited, and leaves the decision to the database", () => {
  const source = strip(read("app/api/comments/[id]/like/route.ts"));
  assert.match(source, /export async function POST/);
  assert.doesNotMatch(source, /export async function (GET|PATCH|DELETE|PUT)/);
  assert.match(source, /status: 401/);
  assert.match(source, /z\.string\(\)\.uuid\(\)/);
  assert.match(source, /desiredStateSchema\.safeParse/);
  assert.match(source, /consume_rate_limit/);
  assert.match(source, /"set_comment_like"/);
  // The person comes from the session inside the database function; the request cannot name one.
  assert.doesNotMatch(source, /user_?id|viewer/i);
});

test("the comment list shows the like button and handles the optimistic update, duplicates and errors", () => {
  const source = strip(read("components/social/comment-section.tsx"));
  assert.match(source, /aria-label=\{commentLikeLabel\(comment\.liked\)\}/);
  assert.match(source, /fetch\(`\/api\/comments\/\$\{id\}\/like`/);
  assert.match(source, /if \(likeInFlight\.current\.has\(id\)\) return/);
  assert.match(source, /setComments\(\(list\) => withLike\(list, id, next\)\)/);
  assert.match(source, /withLikeState\(list, id, previous\)/);
  assert.match(source, /Could not update the like\. Check your connection\./);
  assert.match(source, /formatCount\(comment\.likes_count\)/);
  // A comment that is still being posted cannot be liked: the whole action row waits for the real id.
  assert.match(source, /const canAct = !comment\.id\.startsWith\("temp-"\)/);
  // Existing interactions are still there.
  for (const text of ["Reply", "Edit", "Delete", "Report"]) assert.match(source, new RegExp(text));
});

test("phase 12 stores likes safely: one per person, cascading, RLS on, no direct writes", () => {
  const sql = read("supabase/schema-phase12.sql");
  assert.match(sql, /create table if not exists public\.comment_likes/);
  assert.match(sql, /primary key \(user_id, comment_id\)/);
  assert.match(sql, /comment_id uuid not null references public\.comments \(id\) on delete cascade/);
  assert.match(sql, /user_id uuid not null references public\.profiles \(id\) on delete cascade/);
  assert.match(sql, /alter table public\.comment_likes enable row level security/);
  assert.match(sql, /revoke all on public\.comment_likes from anon, authenticated/);
  assert.match(sql, /grant select on public\.comment_likes to authenticated/);
  assert.doesNotMatch(sql, /grant (insert|update|delete|all)[^;]*comment_likes/i);
  assert.match(sql, /create policy comment_likes_select_own[\s\S]*user_id = \(select public\.requesting_profile_id\(\)\)/);
  // Security definer function, viewer from the session, never a parameter; only signed-in people may run it.
  assert.match(sql, /function public\.set_comment_like\(target uuid, should_like boolean\)[\s\S]*security definer/);
  assert.match(sql, /viewer uuid := public\.requesting_profile_id\(\)/);
  assert.match(sql, /revoke all on function public\.set_comment_like\(uuid, boolean\) from public/);
  assert.match(sql, /grant execute on function public\.set_comment_like\(uuid, boolean\) to authenticated/);
  for (const guard of ["clip_interaction_allowed", "users_are_blocked", "show_comments", "deleted_at is null", "on conflict (user_id, comment_id) do nothing"]) {
    assert.ok(sql.includes(guard), `set_comment_like checks ${guard}`);
  }
  // Counts are counted, not stored: nothing to drift, no trigger.
  assert.doesNotMatch(sql, /allow_counter_write|add column|create trigger/i);
  assert.match(sql, /'likes_count', \(select count\(\*\) from public\.comment_likes/);
  assert.match(sql, /'liked', viewer is not null and exists/);
});

test("phase 12 is part of schema.sql, after phase 11", () => {
  const schema = read("supabase/schema.sql");
  assert.match(schema, /DawnClips Phase 12/);
  assert.ok(schema.indexOf("DawnClips Phase 12") > schema.indexOf("DawnClips Phase 11"));
  assert.ok(schema.lastIndexOf("function public.list_comments") > schema.indexOf("DawnClips Phase 12"), "the schema ends with the phase 12 list_comments");
});

test("the composer is one compact row: input, emoji button and send button inside the same box", () => {
  const source = strip(read("components/social/comment-composer.tsx"));
  const pill = source.slice(source.indexOf('<div className="flex items-end'), source.indexOf("{emojiOpen ? ("));
  assert.match(pill, /<textarea/);
  assert.match(pill, /rows=\{1\}/);
  assert.match(pill, /aria-label="Insert emoji"/);
  assert.match(pill, /type="submit"/);
  // The old tall box is gone.
  assert.doesNotMatch(source, /rows=\{3\}|min-h-\[4\.5rem\]/);
  // The picker still opens below the row, and Cancel (replies) sits outside it.
  assert.ok(source.indexOf('role="group" aria-label="Emoji"') > source.indexOf('type="submit"'));
  // 16px text on phones so iOS does not zoom the page when the box is focused.
  assert.match(source, /text-base[^"]*md:text-\[15px\]/);
  // Avatar and box share one row in the comment section.
  assert.match(strip(read("components/social/comment-section.tsx")), /<div className="flex items-start gap-2\.5 px-4 py-3 md:px-5">/);
});

// ---------------------------------------------------------------------------
// The SQL on a real Postgres engine (PGlite). Skipped when the package is not installed:
//   npm i --no-save @electric-sql/pglite
// ---------------------------------------------------------------------------

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
const [alice, bob, carol, dave] = [id(1), id(2), id(3), id(4)];
const [clipPublic, clipDraft, clipHidden] = [id(101), id(102), id(103)];
const k = { top: id(201), reply: id(202), deleted: id(203), hiddenAuthor: id(204), blockedAuthor: id(205), onDraft: id(206) };

const harness = `
  create role authenticated nologin;
  create role anon nologin;
  create table public.profiles (id uuid primary key, username text, display_name text, avatar_url text);
  create table public.profile_settings (profile_id uuid primary key, show_comments boolean not null default true);
  create table public.blocks (blocker uuid, blocked uuid);
  create table public.clips (id uuid primary key, user_id uuid not null, status text not null default 'published');
  create table public.comments (
    id uuid primary key,
    user_id uuid not null references public.profiles (id) on delete cascade,
    clip_id uuid not null references public.clips (id) on delete cascade,
    parent_id uuid references public.comments (id) on delete cascade,
    content text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    deleted_at timestamptz
  );
  create function public.requesting_profile_id() returns uuid language sql stable as
    $$ select nullif(current_setting('test.viewer', true), '')::uuid $$;
  create function public.users_are_blocked(a uuid, b uuid) returns boolean language sql stable as
    $$ select exists (select 1 from public.blocks where (blocker = a and blocked = b) or (blocker = b and blocked = a)) $$;
  create function public.clip_is_visible(target uuid, viewer uuid, x boolean) returns boolean language sql stable as
    $$ select exists (select 1 from public.clips where id = target and status = 'published') $$;
  create function public.clip_interaction_allowed(target uuid, viewer uuid, for_comment boolean) returns boolean language sql stable as
    $$ select viewer is not null and exists (select 1 from public.clips where id = target and status = 'published')
         and not public.users_are_blocked((select user_id from public.clips where id = target), viewer) $$;
  insert into public.profiles (id, username, display_name) values
    ('${alice}', 'alice', 'Alice'), ('${bob}', 'bob', 'Bob'), ('${carol}', 'carol', 'Carol'), ('${dave}', 'dave', 'Dave');
  insert into public.profile_settings (profile_id, show_comments) values
    ('${alice}', true), ('${bob}', true), ('${carol}', false), ('${dave}', true);
  insert into public.clips (id, user_id, status) values
    ('${clipPublic}', '${alice}', 'published'), ('${clipDraft}', '${alice}', 'draft'), ('${clipHidden}', '${alice}', 'published');
  insert into public.comments (id, user_id, clip_id, parent_id, content, deleted_at) values
    ('${k.top}', '${bob}', '${clipPublic}', null, 'top comment', null),
    ('${k.reply}', '${alice}', '${clipPublic}', '${k.top}', 'a reply', null),
    ('${k.deleted}', '${bob}', '${clipPublic}', null, 'gone', now()),
    ('${k.hiddenAuthor}', '${carol}', '${clipPublic}', null, 'carol hides her comments', null),
    ('${k.blockedAuthor}', '${dave}', '${clipPublic}', null, 'dave', null),
    ('${k.onDraft}', '${bob}', '${clipDraft}', null, 'on an unpublished clip', null);
  insert into public.blocks values ('${dave}', '${bob}');
`;

const as = (db: Db, who: string | null) => db.exec(`select set_config('test.viewer', '${who ?? ""}', false)`);
const like = async (db: Db, who: string | null, comment: string, should: boolean) => {
  await as(db, who);
  return (await db.query(`select public.set_comment_like('${comment}', ${should}) as r`)).rows[0].r as { liked: boolean; likes_count: number };
};
const refused = async (db: Db, who: string | null, comment: string, pattern: RegExp) => {
  await as(db, who);
  await assert.rejects(db.query(`select public.set_comment_like('${comment}', true)`), pattern);
};
const listed = async (db: Db, who: string | null, clip: string) => {
  await as(db, who);
  const rows = (await db.query(`select public.list_comments('${clip}') as r`)).rows[0].r as Array<{ id: string; likes_count: number; liked: boolean }>;
  return new Map(rows.map((row) => [row.id, row]));
};

test("phase 12 comment likes behave as intended on Postgres", async (t) => {
  const db = await openDb();
  if (!db) {
    t.skip("install @electric-sql/pglite to run the database tests");
    return;
  }
  try {
    await db.exec(harness);
    const migration = read("supabase/schema-phase12.sql");
    await db.exec(migration);
    await db.exec(migration); // safe to run again

    // Like, no duplicate from the same person, unlike, unlike again.
    assert.deepEqual(await like(db, alice, k.top, true), { liked: true, likes_count: 1 });
    assert.deepEqual(await like(db, alice, k.top, true), { liked: true, likes_count: 1 });
    assert.deepEqual(await like(db, bob, k.top, true), { liked: true, likes_count: 2 });
    assert.equal(Number((await db.query(`select count(*) as n from public.comment_likes where comment_id = '${k.top}'`)).rows[0].n), 2);
    assert.deepEqual(await like(db, alice, k.top, false), { liked: false, likes_count: 1 });
    assert.deepEqual(await like(db, alice, k.top, false), { liked: false, likes_count: 1 });
    assert.deepEqual(await like(db, alice, k.top, true), { liked: true, likes_count: 2 });

    // The list shows counts to everyone and "liked" per viewer; signed-out visitors see counts, never liked.
    let view = await listed(db, alice, clipPublic);
    assert.deepEqual([view.get(k.top)?.likes_count, view.get(k.top)?.liked], [2, true]);
    assert.deepEqual([view.get(k.reply)?.likes_count, view.get(k.reply)?.liked], [0, false]);
    view = await listed(db, carol, clipPublic);
    assert.deepEqual([view.get(k.top)?.likes_count, view.get(k.top)?.liked], [2, false]);
    view = await listed(db, null, clipPublic);
    assert.deepEqual([view.get(k.top)?.likes_count, view.get(k.top)?.liked], [2, false]);

    // Signed out, missing, deleted, unpublished clip, blocked and hidden-author comments are all refused.
    await refused(db, null, k.top, /unauthorized/);
    await refused(db, alice, id(999), /not allowed/);
    await refused(db, alice, k.deleted, /not allowed/);
    await refused(db, bob, k.onDraft, /not allowed/);
    await refused(db, bob, k.blockedAuthor, /not allowed/);
    await refused(db, bob, k.hiddenAuthor, /not allowed/);
    // The clip owner can still see (and like) a comment whose author hides comments on their profile.
    assert.deepEqual(await like(db, alice, k.hiddenAuthor, true), { liked: true, likes_count: 1 });
    // Nothing was written by the refused attempts.
    assert.equal(Number((await db.query(`select count(*) as n from public.comment_likes where comment_id in ('${k.deleted}', '${k.onDraft}', '${k.blockedAuthor}')`)).rows[0].n), 0);

    // Direct table access: signed-in people read only their own rows and cannot write at all; visitors get nothing.
    await db.exec("set role authenticated");
    await as(db, bob);
    const own = (await db.query(`select user_id from public.comment_likes`)).rows.map((row) => row.user_id);
    assert.deepEqual([...new Set(own)], [bob]);
    await assert.rejects(db.query(`insert into public.comment_likes (user_id, comment_id) values ('${bob}', '${k.reply}')`), /permission denied/);
    await assert.rejects(db.query(`delete from public.comment_likes`), /permission denied/);
    await assert.rejects(db.query(`update public.comment_likes set created_at = now()`), /permission denied/);
    await db.exec("reset role; set role anon");
    await assert.rejects(db.query(`select * from public.comment_likes`), /permission denied/);
    await db.exec("reset role");

    // Deleting a comment deletes its likes, and a whole reply chain takes its likes with it.
    await like(db, bob, k.reply, true);
    await db.exec(`delete from public.comments where id = '${k.top}'`);
    const left = (await db.query(`select comment_id from public.comment_likes order by comment_id`)).rows.map((row) => row.comment_id);
    assert.deepEqual(left, [k.hiddenAuthor]);
  } finally {
    await db.close();
  }
});
