-- DawnClips Phase 11: delete comments for real.
--
-- Why: delete_comment() only marked a comment as deleted (deleted_at set, content replaced by '[deleted]'). The row
-- stayed in public.comments, list_comments() kept returning it to its author, and the UI showed a "Comment deleted"
-- tombstone. Replies under a deleted comment were counted but could not be shown to other people.
--
-- What this does:
--   1. delete_comment(target) now deletes the row. Only the author of the comment can delete it (unchanged: there is
--      no moderator or clip-owner path for comments). Replies are removed with it, which is what the existing
--      foreign key already declares (comments.parent_id references comments on delete cascade). Siblings, comments
--      on other clips and every other comment are untouched.
--   2. clips.comments_count drops by the number of live comments removed (the comment and all its replies), not by
--      one. The result also lists the ids that were removed so the UI can drop exactly those.
--   3. One-time clean-up of tombstones created before this change: every row with deleted_at set is deleted, with
--      its replies, and clips.comments_count is reduced by the live replies that go with them. Tombstones were
--      already subtracted from the count when they were created.
--
-- Comments have no files in Cloudflare R2, so nothing outside the database is touched. Run it in the Supabase SQL
-- editor after schema-phase10.sql. Safe to run more than once. Row Level Security, grants and the function signature
-- are unchanged.
--
-- Optional pre-flight (read-only). "tombstones" is how many rows step 3 deletes, "live_replies" how many visible
-- replies are deleted with them:
--   with recursive doomed as (
--     select id, deleted_at from public.comments where deleted_at is not null
--     union
--     select c.id, c.deleted_at from public.comments c join doomed d on c.parent_id = d.id
--   )
--   select count(*) filter (where deleted_at is not null) as tombstones,
--          count(*) filter (where deleted_at is null) as live_replies
--   from doomed;

create or replace function public.delete_comment(target uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer uuid := public.requesting_profile_id();
  clip uuid;
  doomed uuid[];
  removed integer;
  total integer;
begin
  if viewer is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  -- Only the author can delete a comment. A missing comment and someone else's comment look the same to the caller.
  select c.clip_id into clip
  from public.comments c
  where c.id = target and c.user_id = viewer
  for update;
  if not found then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  -- The comment and every reply beneath it, however deep.
  with recursive tree as (
    select id, deleted_at from public.comments where id = target
    union
    select c.id, c.deleted_at from public.comments c join tree t on c.parent_id = t.id
  )
  select array_agg(id), (count(*) filter (where deleted_at is null))::integer
  into doomed, removed
  from tree;

  delete from public.comments where id = any(doomed);

  perform set_config('dawnclips.allow_counter_write', 'on', true);
  update public.clips
  set comments_count = greatest(comments_count - removed, 0)
  where id = clip
  returning comments_count into total;

  return jsonb_build_object('deleted', true, 'comments_count', total, 'removed_ids', to_jsonb(doomed));
end;
$$;

-- One-time clean-up of comments that were only marked as deleted.
do $$
declare
  purged integer;
begin
  perform set_config('dawnclips.allow_counter_write', 'on', true);

  with recursive doomed as (
    select id, clip_id, deleted_at from public.comments where deleted_at is not null
    union
    select c.id, c.clip_id, c.deleted_at from public.comments c join doomed d on c.parent_id = d.id
  ),
  live as (
    select clip_id, (count(*))::integer as n from doomed where deleted_at is null group by clip_id
  )
  update public.clips cl
  set comments_count = greatest(cl.comments_count - live.n, 0)
  from live
  where cl.id = live.clip_id;

  delete from public.comments where deleted_at is not null;
  get diagnostics purged = row_count;
  raise notice 'DawnClips Phase 11: removed % comment(s) that were only marked as deleted.', purged;
end;
$$;
