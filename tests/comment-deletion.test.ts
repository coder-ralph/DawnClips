import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { removeSubtree, restoreComments, subtreeIds, visibleComments } from "../lib/comment-tree";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

type C = { id: string; parent_id: string | null; created_at: string; deleted?: boolean };
const at = (minute: number) => `2026-11-16T10:${String(minute).padStart(2, "0")}:00.000Z`;
const thread: C[] = [
  { id: "a", parent_id: null, created_at: at(1) },
  { id: "a1", parent_id: "a", created_at: at(2) },
  { id: "a1a", parent_id: "a1", created_at: at(3) },
  { id: "a2", parent_id: "a", created_at: at(4) },
  { id: "b", parent_id: null, created_at: at(5) },
  { id: "b1", parent_id: "b", created_at: at(6) },
];

// ---------------------------------------------------------------------------
// Replies and nested comments
// ---------------------------------------------------------------------------

test("deleting a comment removes it and every reply beneath it, and nothing else", () => {
  assert.deepEqual([...subtreeIds(thread, "a")].sort(), ["a", "a1", "a1a", "a2"]);
  const { remaining, removed } = removeSubtree(thread, "a");
  assert.deepEqual(removed.map((item) => item.id), ["a", "a1", "a1a", "a2"]);
  assert.deepEqual(remaining.map((item) => item.id), ["b", "b1"]);
  // A reply on its own takes only its own replies with it; siblings and the parent stay.
  assert.deepEqual(removeSubtree(thread, "a1").remaining.map((item) => item.id), ["a", "a2", "b", "b1"]);
  assert.deepEqual(removeSubtree(thread, "a2").removed.map((item) => item.id), ["a2"]);
  assert.deepEqual(removeSubtree(thread, "missing").removed, []);
});

test("subtree lookup survives a malformed cycle", () => {
  const cyclic: C[] = [
    { id: "x", parent_id: "y", created_at: at(1) },
    { id: "y", parent_id: "x", created_at: at(2) },
  ];
  assert.deepEqual([...subtreeIds(cyclic, "x")].sort(), ["x", "y"]);
});

test("optimistic rollback restores exactly what was removed, in order, without touching newer comments", () => {
  const { remaining, removed } = removeSubtree(thread, "a");
  const newer: C = { id: "temp-1", parent_id: null, created_at: at(9) };
  const restored = restoreComments([...remaining, newer], removed);
  assert.deepEqual(restored.map((item) => item.id), ["a", "a1", "a1a", "a2", "b", "b1", "temp-1"]);
  // Restoring twice does not duplicate anything.
  assert.equal(restoreComments(restored, removed).length, restored.length);
  // Mixed timestamp formats (server offset vs JavaScript "Z") still sort by time.
  const mixed = restoreComments(
    [{ id: "late", parent_id: null, created_at: "2026-11-16T10:30:00.000Z" }],
    [{ id: "early", parent_id: null, created_at: "2026-11-16T18:10:00.123456+08:00" }],
  );
  assert.deepEqual(mixed.map((item) => item.id), ["early", "late"]);
});

test("comment counts: the count drops by the whole subtree and returns on rollback", () => {
  let count = thread.length;
  const { removed } = removeSubtree(thread, "a");
  count = Math.max(0, count - removed.length);
  assert.equal(count, 2);
  count += removed.length; // the request failed
  assert.equal(count, thread.length);
});

test("a deleted comment from the server is never shown, and neither are its replies", () => {
  const withTombstone: C[] = thread.map((item) => (item.id === "a1" ? { ...item, deleted: true } : item));
  assert.deepEqual(visibleComments(withTombstone).map((item) => item.id), ["a", "a2", "b", "b1"]);
  assert.deepEqual(visibleComments(thread).map((item) => item.id), thread.map((item) => item.id));
});

// ---------------------------------------------------------------------------
// Server and UI wiring
// ---------------------------------------------------------------------------

test("comment deletion goes through the authorised database function and never touches R2", () => {
  const route = strip(read("app/api/comments/[id]/route.ts"));
  assert.match(route, /export async function DELETE/);
  assert.match(route, /isAuthenticated\) return Response\.json\(\{ error: "Unauthorized" \}, \{ status: 401 \}\)/);
  assert.match(route, /uuid\(\)\.safeParse\(id\)/);
  assert.match(route, /callSocial<[^>]*>\("delete_comment", \{ target: id \}\)/);
  assert.doesNotMatch(route, /r2|deleteObject|from\("comments"\)/);
  // Nothing in the app writes comments directly: the table is only changed by the security-definer functions.
  assert.match(read("supabase/schema.sql"), /revoke insert, update, delete on public\.comments from anon, authenticated/);
});

test("the comment section removes comments without a placeholder and recovers from a failed delete", () => {
  const source = strip(read("components/social/comment-section.tsx"));
  assert.doesNotMatch(source, /Comment deleted/i);
  assert.match(source, /deleteInFlight/);
  assert.match(source, /if \(deleteInFlight\.current\.has\(id\)\) return/);
  assert.match(source, /removeSubtree\(comments, id\)/);
  assert.match(source, /restoreComments\(current, removed\)/);
  assert.match(source, /setCount\(\(value\) => value \+ removed\.length\)/);
  assert.match(source, /response\.status === 403 \|\| response\.status === 404/);
  assert.match(source, /body\.removed_ids/);
  assert.match(source, /visibleComments\(body\.comments/);
  assert.match(source, /deleteInFlight\.current\.delete\(removedId\)/);
  // A reply that could never be displayed (deeper than the thread allows) is not offered.
  assert.match(source, /isSignedIn && depth < MAX_DEPTH/);
});

// ---------------------------------------------------------------------------
// Migration text
// ---------------------------------------------------------------------------

test("phase 11 deletes comments, only for their author, and is part of schema.sql", () => {
  const phase = strip(read("supabase/schema-phase11.sql").replace(/^--.*$/gm, ""));
  const schema = read("supabase/schema.sql");
  assert.match(phase, /create or replace function public\.delete_comment\(target uuid\)/);
  assert.match(phase, /c\.id = target and c\.user_id = viewer/);
  assert.match(phase, /raise exception 'unauthorized'/);
  assert.match(phase, /raise exception 'not allowed'/);
  assert.match(phase, /delete from public\.comments where id = any\(doomed\)/);
  assert.match(phase, /with recursive tree as/);
  assert.match(phase, /count\(\*\) filter \(where deleted_at is null\)/);
  assert.match(phase, /'removed_ids', to_jsonb\(doomed\)/);
  assert.match(phase, /delete from public\.comments where deleted_at is not null/);
  assert.doesNotMatch(phase, /set deleted_at = now\(\)|'\[deleted\]'/);
  assert.doesNotMatch(phase, /create policy|drop policy|grant /i);
  assert.match(schema, /DawnClips Phase 10/);
  assert.match(schema, /DawnClips Phase 11/);
  assert.ok(schema.lastIndexOf("function public.delete_comment") > schema.indexOf("function public.list_comments"), "phase 11 replaces the original function");
});

// ---------------------------------------------------------------------------
// The function itself, on a real Postgres engine (PGlite). Skipped when the package is not installed:
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
const u1 = id(1);
const u2 = id(2);
const [clip1, clip2, clip3] = [id(101), id(102), id(103)];
const c = {
  a: id(201), a1: id(202), a1a: id(203), a2: id(204), b: id(205), other: id(206),
  tombstone: id(301), liveReply: id(302), tombstoneReply: id(303), keeper: id(304),
};

const harness = `
  create table public.profiles (id uuid primary key);
  create table public.clips (id uuid primary key, comments_count integer not null default 0);
  create table public.comments (
    id uuid primary key,
    user_id uuid not null references public.profiles (id) on delete cascade,
    clip_id uuid not null references public.clips (id) on delete cascade,
    parent_id uuid references public.comments (id) on delete cascade,
    content text not null,
    created_at timestamptz not null default now(),
    deleted_at timestamptz
  );
  create function public.requesting_profile_id() returns uuid language sql stable as
    $$ select nullif(current_setting('test.viewer', true), '')::uuid $$;
  insert into public.profiles values ('${u1}'), ('${u2}');
  insert into public.clips values ('${clip1}', 0), ('${clip2}', 0), ('${clip3}', 0);
  -- Legacy data on clip3: a soft-deleted comment with a live reply and a soft-deleted reply, plus one untouched comment.
  -- Tombstones were already subtracted from the count when they were made (live: reply + keeper = 2).
  insert into public.comments (id, user_id, clip_id, parent_id, content, deleted_at) values
    ('${c.tombstone}', '${u1}', '${clip3}', null, '[deleted]', now());
  insert into public.comments (id, user_id, clip_id, parent_id, content, deleted_at) values
    ('${c.liveReply}', '${u2}', '${clip3}', '${c.tombstone}', 'reply under a tombstone', null),
    ('${c.tombstoneReply}', '${u2}', '${clip3}', '${c.tombstone}', '[deleted]', now());
  insert into public.comments (id, user_id, clip_id, content) values ('${c.keeper}', '${u2}', '${clip3}', 'keeper');
  update public.clips set comments_count = 2 where id = '${clip3}';
`;

const viewer = (db: Db, who: string | null) => db.exec(`select set_config('test.viewer', '${who ?? ""}', false)`);
const rows = async (db: Db, clip: string) =>
  (await db.query(`select id from public.comments where clip_id = '${clip}' order by id`)).rows.map((row) => row.id as string);
const count = async (db: Db, clip: string) => Number((await db.query(`select comments_count from public.clips where id = '${clip}'`)).rows[0].comments_count);

test("phase 11 delete_comment behaves as intended on Postgres", async (t) => {
  const db = await openDb();
  if (!db) {
    t.skip("install @electric-sql/pglite to run the database tests");
    return;
  }
  try {
    await db.exec(harness);
    const migration = read("supabase/schema-phase11.sql");
    await db.exec(migration);
    await db.exec(migration); // safe to run again

    await t.test("clean-up: old tombstones and the replies under them are gone, and the count is corrected", async () => {
      assert.deepEqual(await rows(db, clip3), [c.keeper]);
      assert.equal(await count(db, clip3), 1);
    });

    // clip1: a -> a1 -> a1a, a -> a2 (a2 was soft-deleted earlier, so it is not in the count), and b. Live comments: 4.
    await db.exec(`
      insert into public.comments (id, user_id, clip_id, parent_id, content, deleted_at, created_at) values
        ('${c.a}', '${u1}', '${clip1}', null, 'a', null, now()),
        ('${c.a1}', '${u2}', '${clip1}', '${c.a}', 'a1', null, now()),
        ('${c.a1a}', '${u1}', '${clip1}', '${c.a1}', 'a1a', null, now()),
        ('${c.a2}', '${u2}', '${clip1}', '${c.a}', '[deleted]', now(), now()),
        ('${c.b}', '${u2}', '${clip1}', null, 'b', null, now());
      insert into public.comments (id, user_id, clip_id, content) values ('${c.other}', '${u1}', '${clip2}', 'other clip');
      update public.clips set comments_count = 4 where id = '${clip1}';
      update public.clips set comments_count = 1 where id = '${clip2}';
    `);

    await t.test("someone else's comment cannot be deleted", async () => {
      await viewer(db, u2);
      await assert.rejects(db.query(`select public.delete_comment('${c.a}')`), /not allowed/);
      await assert.rejects(db.query(`select public.delete_comment('${c.a1a}')`), /not allowed/);
      assert.equal((await rows(db, clip1)).length, 5);
      assert.equal(await count(db, clip1), 4);
    });

    await t.test("a missing comment and a signed-out caller are rejected", async () => {
      await viewer(db, u1);
      await assert.rejects(db.query(`select public.delete_comment('${id(999)}')`), /not allowed/);
      await viewer(db, null);
      await assert.rejects(db.query(`select public.delete_comment('${c.a}')`), /unauthorized/);
      assert.equal((await rows(db, clip1)).length, 5);
    });

    await t.test("deleting a reply removes only that reply and its own replies", async () => {
      await viewer(db, u1);
      const result = (await db.query(`select public.delete_comment('${c.a1a}') as r`)).rows[0].r as { comments_count: number; removed_ids: string[] };
      assert.deepEqual(result.removed_ids, [c.a1a]);
      assert.equal(result.comments_count, 3);
      assert.deepEqual((await rows(db, clip1)).sort(), [c.a, c.a1, c.a2, c.b].sort());
    });

    await t.test("deleting a comment removes its replies, counts only the live ones, and leaves everything else", async () => {
      await viewer(db, u1);
      const result = (await db.query(`select public.delete_comment('${c.a}') as r`)).rows[0].r as { deleted: boolean; comments_count: number; removed_ids: string[] };
      assert.equal(result.deleted, true);
      assert.deepEqual([...result.removed_ids].sort(), [c.a, c.a1, c.a2].sort());
      assert.equal(result.comments_count, 1); // only b is left
      assert.deepEqual(await rows(db, clip1), [c.b]);
      assert.equal(await count(db, clip1), 1);
      // Another clip is untouched.
      assert.deepEqual(await rows(db, clip2), [c.other]);
      assert.equal(await count(db, clip2), 1);
    });

    await t.test("the same comment cannot be deleted twice", async () => {
      await viewer(db, u1);
      await assert.rejects(db.query(`select public.delete_comment('${c.a}')`), /not allowed/);
      assert.equal(await count(db, clip1), 1);
    });

    await t.test("the count never goes below zero", async () => {
      await db.exec(`update public.clips set comments_count = 0 where id = '${clip2}'`);
      await viewer(db, u1);
      const result = (await db.query(`select public.delete_comment('${c.other}') as r`)).rows[0].r as { comments_count: number };
      assert.equal(result.comments_count, 0);
      assert.deepEqual(await rows(db, clip2), []);
    });
  } finally {
    await db.close();
  }
});
