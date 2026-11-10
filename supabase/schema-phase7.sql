-- DawnClips Phase 7: fix viewer_clip_flags.
-- In the earlier definition the unnest alias was called "id", which collided with the "id" column of
-- likes / bookmarks / follows / clips. "clip_id = id" compared a row with its own id, so liked and
-- bookmarked were always false after a refresh (and following was always true).
-- Safe to run more than once. Grants on the function are preserved.

create or replace function public.viewer_clip_flags(ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer uuid := public.requesting_profile_id();
begin
  if viewer is null or ids is null then
    return '{}'::jsonb;
  end if;
  return coalesce((
    select jsonb_object_agg(q.cid, jsonb_build_object(
      'liked', exists (select 1 from public.likes l where l.user_id = viewer and l.clip_id = q.cid),
      'bookmarked', exists (select 1 from public.bookmarks b where b.user_id = viewer and b.clip_id = q.cid),
      'following', exists (
        select 1
        from public.clips c
        join public.follows f on f.following_id = c.user_id
        where f.follower_id = viewer and c.id = q.cid
      )
    ))
    from unnest(ids[1:50]) as q(cid)
  ), '{}'::jsonb);
end;
$$;

revoke all on function public.viewer_clip_flags(uuid[]) from public;
grant execute on function public.viewer_clip_flags(uuid[]) to authenticated;
