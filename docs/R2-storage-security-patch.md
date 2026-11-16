# R2 storage security patch

## What changed
| Finding | Fix |
|---|---|
| A. Signed-in users could write storage columns on `clips` | `supabase/schema-phase10.sql`: trigger `guard_clip_storage` blocks changes to `user_id`, `r2_object_key`, `thumbnail_object_key`, `thumbnail_url`, `file_size`, `mime_type`, `status` for signed-in users; insert revoked from `authenticated` |
| B. Cross-user deletion | `deleteObject(key, ownerId)` / `deleteObjects(keys, ownerId)` now check the owner passed in (the old check compared a key with itself). Clip delete, upload cancel, stale cleanup and account deletion act only on keys derived from the clip's owner + id |
| C. Cross-user read via poster key | `buildClipPlayback` signs only keys equal to `clips/<owner>/<clip>.mp4|jpg`; a foreign video key refuses playback, a foreign poster key is dropped |
| D. Upload checks skippable via `status` | `initiate`, `complete`, `cancel` write clip rows with the service role, scoped by clip id and verified owner; `complete` also requires `status = processing` to publish |

Also: the trigger rejects any storage key that is not the clip's derived key, for every role including the service role.
Visibility behaviour, RLS policies, auth, R2 and the upload/playback client flow are unchanged.

## Apply (Supabase)
1. Optional pre-flight in the SQL editor, expect zero rows:
   `select id, user_id, r2_object_key, thumbnail_object_key from public.clips c where (c.r2_object_key is not null and c.r2_object_key <> 'clips/'||c.user_id||'/'||c.id||'.mp4') or (c.thumbnail_object_key is not null and c.thumbnail_object_key <> 'clips/'||c.user_id||'/'||c.id||'.jpg');`
2. Deploy this code first (the upload routes must use the service role before insert is revoked), with `SUPABASE_SERVICE_ROLE_KEY` set in Vercel (it already is, the delete route uses it).
3. Run `supabase/schema-phase10.sql` in the SQL editor. Safe to run again. It does not rewrite rows and reports mismatched rows with a notice or warning.
4. Smoke test: upload a clip, play it, delete it.

Fresh installs: `schema.sql` already includes phase 10 at the end.

## Tests
`tests/storage-security.test.ts`: key derivation, foreign video/poster/delete keys, owner-bound R2 deletes, service-role writes, migration contents, and (needs `npm i --no-save @electric-sql/pglite`, otherwise skipped) the migration run on Postgres: attacks A–D rejected, normal edits/upload/publish/remove, definer functions, legacy rows.
Results: `tsc` clean, `eslint` clean, `npm test` 40 pass + 1 skipped (PGlite) and 22/22 in the file with PGlite installed, `next build` passes.

## Remaining risks
- Rows whose stored keys are not derived keys (the pre-flight) will stop playing and are not deleted from R2 until fixed; the app has always generated derived keys, so none are expected.
- A tampered thumbnail on an existing row is ignored at playback; delete of a tampered row removes the clip's own objects, not the foreign one.
- Signed URLs remain bearer tokens until expiry (up to the TTL); no playback rate limit; `visibility` stays owner-editable by design, so with `R2_PUBLIC_URL` ever set a stored public `thumbnail_url` would stay public after a public -> private change.
- Client tooling that wrote clips as a signed-in user must switch to the service role.
