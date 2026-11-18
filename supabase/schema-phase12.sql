-- DawnClips Phase 12: likes on comments.
--
-- What this adds:
--   1. public.comment_likes: one row per (person, comment). The primary key makes a second like from the same person
--      impossible. Rows are removed automatically with the comment (so deleting a comment, or a whole reply chain,
--      deletes its likes) and with the person's profile.
--   2. public.set_comment_like(target, should_like): the only way to like or unlike. SECURITY DEFINER like set_like():
--      the viewer comes from the verified session, never from the request. It refuses when the comment does not exist
--      or was deleted, when the clip is not one the viewer may interact with (unpublished, private, blocked), when the
--      comment's author and the viewer have blocked each other, and when the comment is not one the viewer can see
--      (author hides comments on their profile). Liking twice, or unliking something not liked, changes nothing.
--      Returns { liked, likes_count }.
--   3. list_comments(target) now also returns likes_count and liked for each comment. Counts are counted from
--      comment_likes, not stored in a counter column, so they cannot drift and need no trigger.
--
-- Row Level Security: enabled on comment_likes. Signed-in people can read only their own rows; nobody can insert,
-- update or delete rows directly (privileges revoked), exactly like public.likes. Anonymous visitors have no access
-- to the table. Run it in the Supabase SQL editor after schema-phase11.sql. Safe to run more than once. Nothing
-- existing is dropped or changed besides the list_comments result (two extra fields).

create table if not exists public.comment_likes (
  user_id uuid not null references public.profiles (id) on delete cascade,
  comment_id uuid not null references public.comments (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, comment_id)
);

create index if not exists comment_likes_comment_idx on public.comment_likes (comment_id);

alter table public.comment_likes enable row level security;

revoke all on public.comment_likes from anon, authenticated;
grant select on public.comment_likes to authenticated;

drop policy if exists comment_likes_select_own on public.comment_likes;
create policy comment_likes_select_own on public.comment_likes
  for select to authenticated
  using (user_id = (select public.requesting_profile_id()));

create or replace function public.set_comment_like(target uuid, should_like boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer uuid := public.requesting_profile_id();
  commented public.comments;
  total integer;
begin
  if viewer is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if target is null or should_like is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select * into commented from public.comments where id = target and deleted_at is null;
  if not found then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not public.clip_interaction_allowed(commented.clip_id, viewer, false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if public.users_are_blocked(commented.user_id, viewer) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  -- Same visibility rule as list_comments: you can only like what you can see.
  if commented.user_id <> viewer
    and not exists (select 1 from public.profile_settings s where s.profile_id = commented.user_id and s.show_comments)
    and not exists (select 1 from public.clips cl where cl.id = commented.clip_id and cl.user_id = viewer) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if should_like then
    insert into public.comment_likes (user_id, comment_id)
    values (viewer, target)
    on conflict (user_id, comment_id) do nothing;
  else
    delete from public.comment_likes where user_id = viewer and comment_id = target;
  end if;

  select count(*)::integer into total from public.comment_likes where comment_id = target;
  return jsonb_build_object('liked', should_like, 'likes_count', total);
end;
$$;

revoke all on function public.set_comment_like(uuid, boolean) from public;
grant execute on function public.set_comment_like(uuid, boolean) to authenticated;

create or replace function public.list_comments(target uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer uuid := public.requesting_profile_id();
begin
  if viewer is null then
    if not public.clip_is_visible(target, null, true) then
      return '[]'::jsonb;
    end if;
  elsif not exists (select 1 from public.clips where id = target and user_id = viewer)
    and not public.clip_is_visible(target, viewer, true) then
    return '[]'::jsonb;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id,
      'parent_id', c.parent_id,
      'content', case when c.deleted_at is null or c.user_id = viewer then c.content else null end,
      'created_at', c.created_at,
      'updated_at', c.updated_at,
      'deleted', c.deleted_at is not null,
      'is_own', c.user_id = viewer,
      'user_id', p.id,
      'username', p.username,
      'display_name', p.display_name,
      'avatar_url', p.avatar_url,
      'likes_count', (select count(*) from public.comment_likes l where l.comment_id = c.id),
      'liked', viewer is not null and exists (
        select 1 from public.comment_likes l where l.comment_id = c.id and l.user_id = viewer
      )
    ) order by c.created_at)
    from public.comments c
    join public.profiles p on p.id = c.user_id
    where c.clip_id = target
      and (c.deleted_at is null or c.user_id = viewer)
      and (
        c.user_id = viewer
        or exists (
          select 1 from public.profile_settings s
          where s.profile_id = c.user_id and s.show_comments
        )
        or exists (select 1 from public.clips cl where cl.id = target and cl.user_id = viewer)
      )
      and (viewer is null or not public.users_are_blocked(c.user_id, viewer))
  ), '[]'::jsonb);
end;
$$;
