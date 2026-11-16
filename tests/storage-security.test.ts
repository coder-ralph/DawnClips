import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { clipObjectKey, clipStorageKeys, hasClipObjectKeyShape, isOwnedObjectKey, resolveClipKeys, splitClipKeys } from "../lib/video";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const attacker = "11111111-1111-4111-8111-111111111111";
const attackerClip = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const victim = "22222222-2222-4222-8222-222222222222";
const victimClip = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

// ---------------------------------------------------------------------------
// Findings B and C: keys are derived from the clip's owner and id, never trusted as stored.
// ---------------------------------------------------------------------------

test("a clip's keys are derived from its owner and its own id", () => {
  assert.deepEqual(clipStorageKeys(attacker, attackerClip), {
    video: `clips/${attacker}/${attackerClip}.mp4`,
    poster: `clips/${attacker}/${attackerClip}.jpg`,
  });
  assert.equal(clipStorageKeys("not-a-uuid", attackerClip), null);
  assert.equal(clipStorageKeys(attacker, "../x"), null);
  assert.equal(clipStorageKeys(undefined, attackerClip), null);
  assert.equal(clipStorageKeys(attacker, attackerClip.toUpperCase()), null);
});

test("playback: another user's video used as a thumbnail key is rejected (finding C)", () => {
  const victimVideo = clipObjectKey(victim, victimClip, "mp4");
  const resolved = resolveClipKeys({
    id: attackerClip,
    ownerId: attacker,
    videoKey: clipObjectKey(attacker, attackerClip, "mp4"),
    posterKey: victimVideo,
  });
  assert.equal(resolved.video, clipObjectKey(attacker, attackerClip, "mp4"));
  assert.equal(resolved.poster, null);
  assert.equal(resolved.posterRejected, true);
});

test("playback: another user's object as the video key is refused", () => {
  const foreign = resolveClipKeys({ id: attackerClip, ownerId: attacker, videoKey: clipObjectKey(victim, victimClip, "mp4"), posterKey: null });
  assert.equal(foreign.video, null);
  assert.equal(foreign.videoRejected, true);
  // Right owner, wrong clip id: also refused.
  assert.equal(resolveClipKeys({ id: attackerClip, ownerId: attacker, videoKey: clipObjectKey(attacker, victimClip, "mp4") }).video, null);
  // A poster key cannot stand in for the video key.
  assert.equal(resolveClipKeys({ id: attackerClip, ownerId: attacker, videoKey: clipObjectKey(attacker, attackerClip, "jpg") }).video, null);
  // Missing owner id (an incomplete authorisation row) fails closed.
  assert.equal(resolveClipKeys({ id: attackerClip, ownerId: undefined, videoKey: clipObjectKey(attacker, attackerClip, "mp4") }).video, null);
});

test("playback: a clip's own keys resolve unchanged", () => {
  const video = clipObjectKey(attacker, attackerClip, "mp4");
  const poster = clipObjectKey(attacker, attackerClip, "jpg");
  assert.deepEqual(resolveClipKeys({ id: attackerClip, ownerId: attacker, videoKey: video, posterKey: poster }), {
    video,
    poster,
    videoRejected: false,
    posterRejected: false,
  });
  const noPoster = resolveClipKeys({ id: attackerClip, ownerId: attacker, videoKey: video, posterKey: null });
  assert.equal(noPoster.poster, null);
  assert.equal(noPoster.posterRejected, false);
});

test("deletion: only keys that belong to the clip are acted on (finding B)", () => {
  const own = [clipObjectKey(attacker, attackerClip, "mp4"), clipObjectKey(attacker, attackerClip, "jpg")];
  const victimVideo = clipObjectKey(victim, victimClip, "mp4");
  assert.deepEqual(splitClipKeys({ id: attackerClip, ownerId: attacker }, [own[0], victimVideo]), { own: [own[0]], foreign: [victimVideo] });
  assert.deepEqual(splitClipKeys({ id: attackerClip, ownerId: attacker }, [...own, null, undefined, ""]), { own, foreign: [] });
  // Another clip of the same owner is not this clip's object either.
  const sibling = clipObjectKey(attacker, victimClip, "mp4");
  assert.deepEqual(splitClipKeys({ id: attackerClip, ownerId: attacker }, [sibling]), { own: [], foreign: [sibling] });
  // Unknown owner or clip: nothing is ever treated as owned.
  assert.deepEqual(splitClipKeys({ id: attackerClip, ownerId: "x" }, own), { own: [], foreign: own });
});

test("object key helpers: shape check is not an ownership check", () => {
  const victimVideo = clipObjectKey(victim, victimClip, "mp4");
  assert.equal(hasClipObjectKeyShape(victimVideo), true);
  assert.equal(isOwnedObjectKey(victimVideo, attacker), false);
  assert.equal(isOwnedObjectKey(victimVideo, victim), true);
  assert.equal(hasClipObjectKeyShape(`${victimVideo}/../x`), false);
});

test("r2 deletes take the owner and never derive it from the key being deleted", () => {
  const r2 = strip(read("lib/r2.ts"));
  assert.match(r2, /export async function deleteObject\(key: string, ownerId: string\)/);
  assert.match(r2, /export async function deleteObjects\(keys: string\[\], ownerId: string\)/);
  assert.doesNotMatch(r2, /isOwnedObjectKey\(key, key\.split/);
  assert.match(r2, /isOwnedObjectKey\(key, ownerId\)/);
});

test("playback signs only validated keys", () => {
  const source = strip(read("lib/clip-playback.ts"));
  const resolve = source.indexOf("resolveClipKeys(");
  const sign = source.indexOf("createPlaybackUrl(keys.");
  assert.ok(resolve > 0 && sign > resolve, "keys are resolved before anything is signed");
  assert.doesNotMatch(source, /createPlaybackUrl\(clip\./);
  assert.doesNotMatch(source, /publicObjectUrl\(clip\./);
  assert.match(source, /if \(!keys\.video\)/);
  assert.match(strip(read("app/api/clips/[id]/playback/route.ts")), /buildClipPlayback\(clip,/);
});

test("clip deletion, upload cancel, stale cleanup and account deletion are bound to the clip's own keys", () => {
  for (const path of ["app/api/clips/[id]/route.ts", "app/api/clips/upload/cancel/route.ts", "app/api/clips/upload/initiate/route.ts", "lib/deletion.ts"]) {
    const source = strip(read(path));
    assert.match(source, /splitClipKeys\(/, path);
    assert.doesNotMatch(source, /deleteObjects?\([^)]*\)/.test(source) ? /deleteObjects?\((?![^)]*,)/ : /$^/, path);
  }
  const deleteRoute = strip(read("app/api/clips/[id]/route.ts"));
  assert.match(deleteRoute, /deleteObject\(key, clip\.data\.user_id\)/);
  assert.match(strip(read("lib/deletion.ts")), /deleteObjects\(pending, profile\.data\.id\)/);
  assert.match(strip(read("lib/deletion.ts")), /isOwnedObjectKey\(key, profileId\)/);
});

// ---------------------------------------------------------------------------
// Finding A and D: clip rows are written by the server with the service role.
// ---------------------------------------------------------------------------

test("upload routes write clip rows with the service role, scoped to the verified owner", () => {
  for (const path of ["app/api/clips/upload/initiate/route.ts", "app/api/clips/upload/complete/route.ts", "app/api/clips/upload/cancel/route.ts"]) {
    const source = strip(read(path));
    assert.match(source, /createAdminSupabaseClient\(\)/, path);
    assert.doesNotMatch(source, /supabase\s*\.from\("clips"\)\s*\.(insert|update)/, `${path} must not write clips as the signed-in user`);
    assert.doesNotMatch(source, /supabase\s*\.from\("clips"\)\s*\n?\s*\.(insert|update)/, path);
    for (const write of source.match(/admin\s*\.from\("clips"\)[\s\S]*?;/g) ?? []) {
      if (/\.(update|insert)\(/.test(write)) assert.match(write, /\.eq\("id"|\.insert\(\{/, `${path}: ${write}`);
    }
  }
  const complete = strip(read("app/api/clips/upload/complete/route.ts"));
  assert.match(complete, /clipStorageKeys\(profile\.profile\.id, clip\.data\.id\)/);
  assert.match(complete, /clip\.data\.r2_object_key !== keys\.video/);
  assert.match(complete, /clip\.data\.thumbnail_object_key === keys\.poster/);
  assert.match(complete, /\.eq\("status", "processing"\)\s*\.select\("id"\)/);
  assert.doesNotMatch(complete, /statObject\(clip\.data\./);
  assert.doesNotMatch(complete, /deleteObject\(clip\.data\./);
  const initiate = strip(read("app/api/clips/upload/initiate/route.ts"));
  assert.match(initiate, /admin\.from\("clips"\)\.insert\(/);
  assert.match(initiate, /user_id: profile\.profile\.id/);
});

test("phase 10 blocks direct writes to storage columns and is part of schema.sql", () => {
  const phase = strip(read("supabase/schema-phase10.sql").replace(/^--.*$/gm, ""));
  const schema = read("supabase/schema.sql");
  assert.match(phase, /create or replace function public\.guard_clip_storage\(\)/);
  assert.match(phase, /before insert or update on public\.clips/);
  assert.match(phase, /revoke insert on public\.clips from authenticated/);
  assert.match(phase, /current_user in \('service_role', 'postgres', 'supabase_admin'\)/);
  for (const column of ["user_id", "r2_object_key", "thumbnail_object_key", "thumbnail_url", "file_size", "mime_type", "status"]) {
    assert.match(phase, new RegExp(`new\\.${column} is distinct from old\\.${column}`), column);
  }
  assert.match(phase, /'clips\/' \|\| new\.user_id::text \|\| '\/' \|\| new\.id::text \|\| '\.mp4'/);
  assert.match(phase, /'clips\/' \|\| new\.user_id::text \|\| '\/' \|\| new\.id::text \|\| '\.jpg'/);
  // It does not rewrite rows, change policies, or widen any grant.
  assert.doesNotMatch(phase, /^\s*update\s+public\.clips/im);
  assert.doesNotMatch(phase, /create policy|drop policy|alter policy/i);
  assert.doesNotMatch(phase, /grant\s+(insert|update|all)/i);
  assert.match(schema, /DawnClips Phase 10/);
  assert.ok(schema.indexOf("guard_clip_storage") > schema.indexOf("grant select, insert, update on public.clips to authenticated"), "the revoke runs after the original grant");
});

// ---------------------------------------------------------------------------
// The migration itself, run on a real Postgres engine (PGlite). Skipped when the package is not installed:
//   npm i --no-save @electric-sql/pglite
// ---------------------------------------------------------------------------

type Db = {
  exec: (sql: string) => Promise<unknown>;
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
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

const harness = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
  create table public.profiles (id uuid primary key);
  create table public.clips (
    id uuid primary key,
    user_id uuid not null references public.profiles (id),
    title text not null,
    r2_object_key text unique,
    thumbnail_url text,
    thumbnail_object_key text,
    file_size bigint,
    mime_type text,
    status text not null default 'pending' check (status in ('pending', 'processing', 'published', 'failed', 'removed')),
    visibility text not null default 'public',
    comments_mode text not null default 'everyone'
  );
  grant usage on schema public to anon, authenticated, service_role;
  grant select, insert, update on public.clips to authenticated;
  grant select, insert, update, delete on public.clips to service_role;
  insert into public.profiles values ('${attacker}'), ('${victim}');
  -- A legacy row whose keys are not the derived ones, created before the migration.
  insert into public.clips (id, user_id, title, r2_object_key, status)
    values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '${attacker}', 'legacy', 'clips/legacy/object.mp4', 'published');
  insert into public.clips (id, user_id, title, r2_object_key, thumbnail_object_key, status, visibility)
    values ('${victimClip}', '${victim}', 'victim private', 'clips/${victim}/${victimClip}.mp4', 'clips/${victim}/${victimClip}.jpg', 'published', 'private');
  insert into public.clips (id, user_id, title, r2_object_key, thumbnail_object_key, status)
    values ('${attackerClip}', '${attacker}', 'mine', 'clips/${attacker}/${attackerClip}.mp4', 'clips/${attacker}/${attackerClip}.jpg', 'pending');
  -- A security-definer function owned by the table owner, like edit_clip or set_clip_pinned.
  create function public.definer_publish(target uuid) returns void language sql security definer as
    $$ update public.clips set status = 'published' where id = target $$;
  grant execute on function public.definer_publish(uuid) to authenticated;
`;

async function as(db: Db, role: string, sql: string, params?: unknown[]) {
  await db.exec(`set role ${role}`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec("reset role");
  }
}

async function denied(db: Db, role: string, sql: string, params?: unknown[]) {
  await assert.rejects(as(db, role, sql, params), (error: { code?: string; message?: string }) => {
    return error.code === "42501" || /permission denied|managed by the server|invalid clip storage key/.test(String(error.message));
  });
}

const attackerVideo = `clips/${attacker}/${attackerClip}.mp4`;
const victimVideo = `clips/${victim}/${victimClip}.mp4`;

test("phase 10 migration behaves as intended on Postgres", async (t) => {
  const db = await openDb();
  if (!db) {
    t.skip("install @electric-sql/pglite to run the database tests");
    return;
  }
  try {
    await db.exec(harness);
    const migration = read("supabase/schema-phase10.sql");
    await db.exec(migration);
    await db.exec(migration); // safe to run again

    await t.test("finding A/B/C: a signed-in user cannot point a clip at another user's object", async () => {
      await denied(db, "authenticated", `update public.clips set thumbnail_object_key = '${victimVideo}' where id = '${attackerClip}'`);
      await denied(db, "authenticated", `update public.clips set r2_object_key = '${victimVideo}' where id = '${attackerClip}'`);
      await denied(db, "authenticated", `update public.clips set thumbnail_object_key = null where id = '${attackerClip}'`);
      const row = (await db.query(`select r2_object_key, thumbnail_object_key from public.clips where id = '${attackerClip}'`)).rows[0];
      assert.equal(row.r2_object_key, attackerVideo);
      assert.equal(row.thumbnail_object_key, `clips/${attacker}/${attackerClip}.jpg`);
    });

    await t.test("finding D: a signed-in user cannot publish or change status, size, type, thumbnail or owner", async () => {
      for (const change of [
        "status = 'published'",
        "status = 'removed'",
        "file_size = 1",
        "mime_type = 'video/webm'",
        "thumbnail_url = 'https://example.com/x.jpg'",
        `user_id = '${victim}'`,
      ]) {
        await denied(db, "authenticated", `update public.clips set ${change} where id = '${attackerClip}'`);
      }
      assert.equal((await db.query(`select status from public.clips where id = '${attackerClip}'`)).rows[0].status, "pending");
    });

    await t.test("a signed-in user can still edit what they could before", async () => {
      await as(db, "authenticated", `update public.clips set title = 'new title', comments_mode = 'followers', visibility = 'unlisted' where id = '${attackerClip}'`);
      const row = (await db.query(`select title, comments_mode, visibility from public.clips where id = '${attackerClip}'`)).rows[0];
      assert.deepEqual(row, { title: "new title", comments_mode: "followers", visibility: "unlisted" });
    });

    await t.test("a signed-in user cannot insert clips directly", async () => {
      const id = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
      await denied(db, "authenticated", `insert into public.clips (id, user_id, title, status) values ('${id}', '${attacker}', 'x', 'published')`);
    });

    await t.test("even if the insert grant came back, the trigger still enforces pending status and derived keys", async () => {
      await db.exec("grant insert on public.clips to authenticated");
      const id = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
      await denied(db, "authenticated", `insert into public.clips (id, user_id, title, status) values ('${id}', '${attacker}', 'x', 'published')`);
      await denied(db, "authenticated", `insert into public.clips (id, user_id, title, thumbnail_url) values ('${id}', '${attacker}', 'x', 'https://example.com/a.jpg')`);
      await denied(db, "authenticated", `insert into public.clips (id, user_id, title, r2_object_key) values ('${id}', '${attacker}', 'x', '${victimVideo}')`);
      await denied(db, "authenticated", `insert into public.clips (id, user_id, title, thumbnail_object_key) values ('${id}', '${attacker}', 'x', '${victimVideo}')`);
      await db.exec("revoke insert on public.clips from authenticated");
      assert.equal((await db.query(`select count(*)::int as n from public.clips where id = '${id}'`)).rows[0].n, 0);
    });

    await t.test("the server (service role) runs the normal upload flow", async () => {
      const id = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
      const video = `clips/${attacker}/${id}.mp4`;
      const poster = `clips/${attacker}/${id}.jpg`;
      await as(db, "service_role", `insert into public.clips (id, user_id, title, r2_object_key, thumbnail_object_key, file_size, mime_type, status) values ('${id}', '${attacker}', 'upload', '${video}', '${poster}', 1000, 'video/mp4', 'pending')`);
      await as(db, "service_role", `update public.clips set status = 'processing' where id = '${id}' and status = 'pending'`);
      await as(db, "service_role", `update public.clips set status = 'published', thumbnail_url = 'https://cdn.example/${poster}' where id = '${id}' and status = 'processing'`);
      const row = (await db.query(`select status, thumbnail_url from public.clips where id = '${id}'`)).rows[0];
      assert.equal(row.status, "published");
      await as(db, "service_role", `update public.clips set status = 'removed' where id = '${id}'`);
      await as(db, "service_role", `delete from public.clips where id = '${id}'`);
    });

    await t.test("the server cannot write a storage key that is not the clip's own either", async () => {
      await denied(db, "service_role", `update public.clips set thumbnail_object_key = '${victimVideo}' where id = '${attackerClip}'`);
      await denied(db, "service_role", `insert into public.clips (id, user_id, title, r2_object_key) values ('ffffffff-ffff-4fff-8fff-ffffffffffff', '${attacker}', 'x', '${victimVideo}')`);
    });

    await t.test("security-definer functions still change status", async () => {
      await as(db, "authenticated", `select public.definer_publish('${attackerClip}')`);
      assert.equal((await db.query(`select status from public.clips where id = '${attackerClip}'`)).rows[0].status, "published");
    });

    await t.test("existing rows with other keys keep working until their keys are touched", async () => {
      const legacy = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
      await as(db, "service_role", `update public.clips set status = 'removed' where id = '${legacy}'`);
      await as(db, "authenticated", `update public.clips set title = 'renamed' where id = '${legacy}'`);
      await denied(db, "authenticated", `update public.clips set r2_object_key = 'clips/legacy/other.mp4' where id = '${legacy}'`);
      assert.equal((await db.query(`select r2_object_key from public.clips where id = '${legacy}'`)).rows[0].r2_object_key, "clips/legacy/object.mp4");
    });

    await t.test("the victim's row is untouched", async () => {
      const row = (await db.query(`select r2_object_key, thumbnail_object_key, status, visibility from public.clips where id = '${victimClip}'`)).rows[0];
      assert.deepEqual(row, { r2_object_key: victimVideo, thumbnail_object_key: `clips/${victim}/${victimClip}.jpg`, status: "published", visibility: "private" });
    });
  } finally {
    await db.close();
  }
});
