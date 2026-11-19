-- DawnClips Phase 14: mute, restrict, remove follower, and the follower / following lists.
--
-- Reuses what exists: public.follows (follow / unfollow / remove follower) and public.blocks (block). The only new table
-- is public.profile_controls, one row per (owner, target, kind) with kind 'mute' or 'restrict'. The primary key makes
-- a duplicate row impossible, and a CHECK stops anyone from muting or restricting themselves.
--
-- What each action does (they are NOT interchangeable):
--
--   MUTE      "I do not want to see this person's clips."  Affects only the muter's own view.
--             - Their clips leave the muter's feeds (For you, Following, Trending, Latest), the "related clips" list on a
--               clip page and the suggested creators in the sidebar.
--             - Unchanged: the follow (a muted person can stay followed), their profile, search, direct links, saved and
--               liked lists, comments, and notifications. They are not told.
--
--   RESTRICT  "Limit what this person can do around me, without blocking or unfollowing."  Affects what the restricted
--             person does to the restricter, not what the restricter sees.
--             - Their comments and replies on the restricter's clips, and their replies to the restricter's comments, are
--               visible only to them and to the restricter. Everyone else does not see them. (The comment still counts in
--               comments_count; the person who wrote it is not told that it is hidden.)
--             - Their likes, comments, replies and follows no longer notify the restricter.
--             - Unchanged: follows in both directions, the restricter's feeds, profile visibility, and what the restricted
--               person can see.
--
--   BLOCK     Already existed: neither person sees the other's clips, comments or profile, and neither can follow.
--             New in this phase: blocking also removes follows in BOTH directions and the blocker's own mute / restrict of
--             that person (a trigger on public.blocks, so it holds for every way a block is created). Unblocking does not
--             bring those back. Before this phase a block left old follow rows behind, which kept counting in the totals.
--
--   REMOVE FOLLOWER  Deletes the follow row where someone follows YOU. It does not block or restrict them, does not notify
--             them, and they can follow again. You can only ever remove a follower of your own account.
--
-- Writes go through SECURITY DEFINER functions that identify the caller from the Clerk token (requesting_profile_id), so
-- nobody can change another person's relationships. profile_controls has no INSERT / UPDATE / DELETE grants at all, and its
-- SELECT policy shows a person only their own rows.
--
-- Also here: list_profile_people (followers / following with pagination and the viewer's own follow state, which the
-- Follow back / Following buttons need), list_relationship_profiles (the Blocked / Restricted / Muted settings lists),
-- profile_relationship and viewer_clip_flags now also report followed_by, muted and restricted, and notify_user,
-- list_feed, related_clips, trending_sidebar and list_comments are replaced with versions that honour mute / restrict.
-- Each replacement is the current definition plus the one condition described above.
--
-- Run it in the Supabase SQL editor BEFORE deploying the code that calls these functions, after schema-phase13.sql.
-- Safe to run more than once. No existing row is changed or deleted. (Follow rows that already exist between two people
-- where one blocked the other are left alone; they are cleaned up only when a new block is created.)

create table if not exists public.profile_controls (
  owner_id uuid not null references public.profiles (id) on delete cascade,
  target_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  created_at timestamptz not null default now(),
  primary key (owner_id, target_id, kind),
  constraint profile_controls_kind_valid check (kind in ('mute', 'restrict')),
  constraint profile_controls_no_self check (owner_id <> target_id)
);

create index if not exists profile_controls_target_idx on public.profile_controls (target_id);

alter table public.profile_controls enable row level security;

revoke all on public.profile_controls from anon, authenticated;
grant select on public.profile_controls to authenticated;

drop policy if exists profile_controls_select_own on public.profile_controls;
create policy profile_controls_select_own on public.profile_controls
  for select to authenticated
  using (owner_id = (select public.requesting_profile_id()));

-- A block ends every follow between the two people and the blocker's own mute / restrict of the other person.
create or replace function public.blocks_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.follows
  where (follower_id = new.blocker_id and following_id = new.blocked_id)
     or (follower_id = new.blocked_id and following_id = new.blocker_id);
  delete from public.profile_controls
  where owner_id = new.blocker_id and target_id = new.blocked_id;
  return null;
end;
$$;

revoke all on function public.blocks_after_insert() from public;

drop trigger if exists blocks_cleanup on public.blocks;
create trigger blocks_cleanup
  after insert on public.blocks
  for each row execute function public.blocks_after_insert();

create or replace function public.set_profile_control(target uuid, control text, enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer uuid := public.requesting_profile_id();
begin
  if viewer is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if control is null or control not in ('mute', 'restrict') or enabled is null or target is null then
    raise exception 'invalid control' using errcode = '22023';
  end if;
  if target = viewer then
    raise exception 'self action' using errcode = '23514';
  end if;

  if enabled then
    if not exists (
      select 1 from public.profiles
      where id = target and deleted_at is null and deletion_status = 'active'
    ) then
      raise exception 'not allowed' using errcode = '42501';
    end if;
    if public.users_are_blocked(viewer, target) then
      raise exception 'not allowed' using errcode = '42501';
    end if;
    insert into public.profile_controls (owner_id, target_id, kind)
    values (viewer, target, control)
    on conflict (owner_id, target_id, kind) do nothing;
  else
    delete from public.profile_controls
    where owner_id = viewer and target_id = target and kind = control;
  end if;

  return jsonb_build_object('control', control, 'enabled', enabled);
end;
$$;

create or replace function public.remove_follower(target uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer uuid := public.requesting_profile_id();
  changed integer;
  total integer;
begin
  if viewer is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if target is null or target = viewer then
    raise exception 'self action' using errcode = '23514';
  end if;

  -- Only a follow of the caller's own account can be removed: following_id is always the caller.
  delete from public.follows where follower_id = target and following_id = viewer;
  get diagnostics changed = row_count;

  select count(*) into total from public.follows where following_id = viewer;
  return jsonb_build_object('removed', changed = 1, 'followers_count', total);
end;
$$;

create or replace function public.profile_relationship(target uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer uuid := public.requesting_profile_id();
begin
  if viewer is null or target is null then
    return jsonb_build_object('following', false, 'followed_by', false, 'blocked', false, 'muted', false, 'restricted', false);
  end if;
  return jsonb_build_object(
    'following', exists (
      select 1 from public.follows where follower_id = viewer and following_id = target
    ),
    'followed_by', exists (
      select 1 from public.follows where follower_id = target and following_id = viewer
    ),
    'blocked', public.users_are_blocked(viewer, target),
    'muted', exists (
      select 1 from public.profile_controls where owner_id = viewer and target_id = target and kind = 'mute'
    ),
    'restricted', exists (
      select 1 from public.profile_controls where owner_id = viewer and target_id = target and kind = 'restrict'
    )
  );
end;
$$;

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
      ),
      'muted', exists (
        select 1
        from public.clips c
        join public.profile_controls pc on pc.target_id = c.user_id
        where pc.owner_id = viewer and pc.kind = 'mute' and c.id = q.cid
      ),
      'restricted', exists (
        select 1
        from public.clips c
        join public.profile_controls pc on pc.target_id = c.user_id
        where pc.owner_id = viewer and pc.kind = 'restrict' and c.id = q.cid
      )
    ))
    from unnest(ids[1:50]) as q(cid)
  ), '{}'::jsonb);
end;
$$;

-- Followers / following of a profile, newest first, with the viewer's own follow state per row. Same privacy rules as
-- profile_activity (the person's show_followers / show_following settings, blocks, deleted accounts); the owner always
-- sees their own lists. The cursor is the (created_at, id) of the last row returned.
create or replace function public.list_profile_people(
  target uuid,
  list_kind text,
  cursor_at timestamptz default null,
  cursor_id uuid default null,
  page_limit integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer uuid := public.requesting_profile_id();
  owner boolean := viewer is not null and viewer = target;
  settings public.profile_settings;
  lim integer := least(greatest(coalesce(page_limit, 30), 1), 50);
  people jsonb := '[]'::jsonb;
  next_cursor jsonb := null;
  seen integer := 0;
  last_at timestamptz;
  last_id uuid;
  rec record;
begin
  if list_kind is null or list_kind not in ('followers', 'following') then
    raise exception 'invalid kind' using errcode = '22023';
  end if;
  if target is null or not exists (
    select 1 from public.profiles
    where id = target and deleted_at is null and deletion_status = 'active'
  ) then
    return jsonb_build_object('people', people, 'next_cursor', null);
  end if;
  if viewer is not null and not owner and public.users_are_blocked(viewer, target) then
    return jsonb_build_object('people', people, 'next_cursor', null);
  end if;

  select * into settings from public.profile_settings where profile_id = target;
  if not owner and list_kind = 'following' and not coalesce(settings.show_following, true) then
    return jsonb_build_object('people', people, 'next_cursor', null);
  end if;
  if not owner and list_kind = 'followers' and not coalesce(settings.show_followers, true) then
    return jsonb_build_object('people', people, 'next_cursor', null);
  end if;

  for rec in
    select
      p.id,
      p.username,
      p.display_name,
      p.avatar_url,
      f.created_at as followed_at,
      (viewer is not null and exists (
        select 1 from public.follows v where v.follower_id = viewer and v.following_id = p.id
      )) as following
    from public.follows f
    join public.profiles p on p.id = case when list_kind = 'followers' then f.follower_id else f.following_id end
    where case when list_kind = 'followers' then f.following_id = target else f.follower_id = target end
      and p.deleted_at is null
      and p.deletion_status = 'active'
      and (viewer is null or viewer = p.id or not public.users_are_blocked(viewer, p.id))
      and (
        cursor_at is null
        or f.created_at < cursor_at
        or (f.created_at = cursor_at and p.id < cursor_id)
      )
    order by f.created_at desc, p.id desc
    limit lim + 1
  loop
    seen := seen + 1;
    if seen <= lim then
      people := people || jsonb_build_array(jsonb_build_object(
        'id', rec.id,
        'username', rec.username,
        'display_name', rec.display_name,
        'avatar_url', rec.avatar_url,
        'following', rec.following,
        'is_self', viewer is not null and rec.id = viewer
      ));
      last_at := rec.followed_at;
      last_id := rec.id;
    else
      next_cursor := jsonb_build_object('created_at', last_at, 'id', last_id);
    end if;
  end loop;

  return jsonb_build_object('people', people, 'next_cursor', next_cursor);
end;
$$;

-- The caller's own Blocked / Muted / Restricted profiles for the settings pages, newest first. Accounts that are deleted
-- or being deleted are not listed. The cursor is the (created_at, id) of the last row returned.
create or replace function public.list_relationship_profiles(
  list_kind text,
  cursor_at timestamptz default null,
  cursor_id uuid default null,
  page_limit integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer uuid := public.requesting_profile_id();
  lim integer := least(greatest(coalesce(page_limit, 30), 1), 50);
  people jsonb := '[]'::jsonb;
  next_cursor jsonb := null;
  seen integer := 0;
  last_at timestamptz;
  last_id uuid;
  rec record;
begin
  if viewer is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if list_kind is null or list_kind not in ('blocked', 'muted', 'restricted') then
    raise exception 'invalid kind' using errcode = '22023';
  end if;

  for rec in
    select p.id, p.username, p.display_name, p.avatar_url, x.created_at as since
    from (
      select b.blocked_id as pid, b.created_at
      from public.blocks b
      where list_kind = 'blocked' and b.blocker_id = viewer
      union all
      select c.target_id as pid, c.created_at
      from public.profile_controls c
      where c.owner_id = viewer
        and c.kind = case list_kind when 'muted' then 'mute' when 'restricted' then 'restrict' else '' end
    ) x
    join public.profiles p on p.id = x.pid
    where p.deleted_at is null
      and p.deletion_status = 'active'
      and (
        cursor_at is null
        or x.created_at < cursor_at
        or (x.created_at = cursor_at and p.id < cursor_id)
      )
    order by x.created_at desc, p.id desc
    limit lim + 1
  loop
    seen := seen + 1;
    if seen <= lim then
      people := people || jsonb_build_array(jsonb_build_object(
        'id', rec.id,
        'username', rec.username,
        'display_name', rec.display_name,
        'avatar_url', rec.avatar_url
      ));
      last_at := rec.since;
      last_id := rec.id;
    else
      next_cursor := jsonb_build_object('created_at', last_at, 'id', last_id);
    end if;
  end loop;

  return jsonb_build_object('people', people, 'next_cursor', next_cursor);
end;
$$;

-- Replacements: the current definition plus the mute / restrict condition described at the top.
create or replace function public.notify_user(recipient uuid, actor uuid, kind text, reference uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  settings public.profile_settings;
begin
  if recipient is null or actor is null or recipient = actor then
    return;
  end if;
  if kind not in ('like', 'comment', 'reply', 'follow') then
    return;
  end if;
  if public.users_are_blocked(recipient, actor) then
    return;
  end if;
  -- Restricted: the recipient limited this person, so what they do (like, comment, reply, follow) stays quiet.
  if exists (
    select 1 from public.profile_controls pc
    where pc.owner_id = recipient and pc.target_id = actor and pc.kind = 'restrict'
  ) then
    return;
  end if;
  if exists (
    select 1 from public.profiles
    where id = recipient and (deleted_at is not null or deletion_status <> 'active')
  ) then
    return;
  end if;

  select * into settings from public.profile_settings where profile_id = recipient;
  if not coalesce(settings.in_app_notifications, true) then
    return;
  end if;
  if kind = 'like' and not coalesce(settings.notify_likes, true) then return; end if;
  if kind = 'comment' and not coalesce(settings.notify_comments, true) then return; end if;
  if kind = 'reply' and not coalesce(settings.notify_replies, true) then return; end if;
  if kind = 'follow' and not coalesce(settings.notify_follows, true) then return; end if;

  insert into public.notifications (recipient_id, actor_id, type, reference_id)
  values (recipient, actor, kind, reference);
end;
$$;

create or replace function public.list_feed(
  feed text,
  cursor_at timestamptz default null,
  cursor_id uuid default null,
  cursor_score numeric default null,
  page_limit integer default 8
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer uuid := public.requesting_profile_id();
  lim integer := least(greatest(coalesce(page_limit, 8), 1), 20);
  items jsonb := '[]'::jsonb;
  next_cursor jsonb := null;
  seen integer := 0;
  rec record;
begin
  if feed not in ('foryou', 'following', 'trending', 'latest') then
    raise exception 'invalid feed' using errcode = '22023';
  end if;

  if feed = 'following' and viewer is null then
    return jsonb_build_object('clips', '[]'::jsonb, 'next_cursor', null);
  end if;

  for rec in
    select r.*
    from (
      select
        c.id,
        c.title,
        c.description,
        c.hero_tags,
        c.duration,
        c.thumbnail_url,
        c.views_count,
        c.likes_count,
        c.comments_count,
        c.created_at,
        c.edited_at,
        coalesce(c.published_at, c.created_at) + interval '15 minutes' as editable_until,
        c.comments_mode,
        c.user_id,
        p.username,
        p.display_name,
        p.avatar_url,
        case
          when feed in ('foryou', 'trending') then
            (
              c.likes_count * 3 + c.comments_count * 5 + c.views_count
              + case
                  when feed = 'foryou' then
                    4 + case
                      when viewer is not null and c.user_id = viewer then 12
                      when viewer is not null and exists (
                        select 1 from public.follows f
                        where f.follower_id = viewer and f.following_id = c.user_id
                      ) then 12
                      else 0
                    end
                  else 0
                end
            )::numeric
            / power(extract(epoch from (now() - c.created_at)) / 3600 + 2, 1.2)
          else null
        end as score
      from public.clips c
      join public.profiles p on p.id = c.user_id
      where c.status = 'published'
        and c.visibility = 'public'
        and p.deleted_at is null
        and p.deletion_status = 'active'
        and exists (
          select 1 from public.profile_settings s
          where s.profile_id = c.user_id and s.show_highlights
        )
        and (viewer is null or not public.users_are_blocked(c.user_id, viewer))
        and (viewer is null or not exists (
          select 1 from public.profile_controls pc
          where pc.owner_id = viewer and pc.target_id = c.user_id and pc.kind = 'mute'
        ))
        and (feed <> 'trending' or c.created_at > now() - interval '7 days')
        and (
          feed <> 'following'
          or c.user_id in (select following_id from public.follows where follower_id = viewer)
        )
    ) r
    where case
      when feed in ('foryou', 'trending') then
        cursor_score is null
        or r.score < cursor_score
        or (r.score = cursor_score and r.id < cursor_id)
      else
        cursor_at is null
        or r.created_at < cursor_at
        or (r.created_at = cursor_at and r.id < cursor_id)
    end
    order by
      case when feed in ('foryou', 'trending') then r.score end desc nulls last,
      case when feed in ('latest', 'following') then r.created_at end desc nulls last,
      r.id desc
    limit lim + 1
  loop
    seen := seen + 1;
    if seen <= lim then
      items := items || jsonb_build_array(jsonb_build_object(
        'id', rec.id,
        'title', rec.title,
        'description', rec.description,
        'hero_tags', rec.hero_tags,
        'duration', rec.duration,
        'thumbnail_url', rec.thumbnail_url,
        'views_count', rec.views_count,
        'likes_count', rec.likes_count,
        'comments_count', rec.comments_count,
        'created_at', rec.created_at,
        'edited_at', rec.edited_at,
        'editable_until', rec.editable_until,
        'comments_mode', rec.comments_mode,
        'user_id', rec.user_id,
        'username', rec.username,
        'display_name', rec.display_name,
        'avatar_url', rec.avatar_url,
        'score', rec.score
      ));
    else
      next_cursor := jsonb_build_object(
        'created_at', rec.created_at,
        'id', rec.id,
        'score', rec.score
      );
    end if;
  end loop;

  return jsonb_build_object('clips', items, 'next_cursor', next_cursor);
end;
$$;

create or replace function public.related_clips(target uuid, page_limit integer default 6)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer uuid := public.requesting_profile_id();
  tags text[];
  lim integer := least(greatest(coalesce(page_limit, 6), 1), 12);
  items jsonb := '[]'::jsonb;
  rec record;
begin
  select hero_tags into tags from public.clips where id = target;
  for rec in
    select
      c.id,
      c.title,
      c.hero_tags,
      c.views_count,
      c.created_at,
      p.username,
      p.display_name,
      p.avatar_url
    from public.clips c
    join public.profiles p on p.id = c.user_id
    where c.id <> target
      and c.status = 'published'
      and c.visibility = 'public'
      and p.deleted_at is null
      and p.deletion_status = 'active'
      and (viewer is null or not public.users_are_blocked(c.user_id, viewer))
      and (viewer is null or not exists (
        select 1 from public.profile_controls pc
        where pc.owner_id = viewer and pc.target_id = c.user_id and pc.kind = 'mute'
      ))
      and exists (
        select 1 from public.profile_settings s
        where s.profile_id = c.user_id and s.show_highlights
      )
    order by
      case when tags is not null and c.hero_tags && tags then 0 else 1 end,
      c.created_at desc
    limit lim
  loop
    items := items || jsonb_build_array(jsonb_build_object(
      'id', rec.id,
      'title', rec.title,
      'hero_tags', rec.hero_tags,
      'views_count', rec.views_count,
      'created_at', rec.created_at,
      'username', rec.username,
      'display_name', rec.display_name,
      'avatar_url', rec.avatar_url
    ));
  end loop;
  return items;
end;
$$;

create or replace function public.trending_sidebar()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer uuid := public.requesting_profile_id();
  heroes jsonb;
  creators jsonb;
begin
  select coalesce(jsonb_agg(row_to_json(h)), '[]'::jsonb) into heroes
  from (
    select tag as hero_id, count(*) as clip_count
    from public.clips c
    join public.profiles p on p.id = c.user_id
    join public.profile_settings s on s.profile_id = p.id
    cross join lateral unnest(c.hero_tags) as tag
    where c.status = 'published'
      and c.visibility = 'public'
      and p.deleted_at is null
      and p.deletion_status = 'active'
      and s.show_highlights
      and (viewer is null or not public.users_are_blocked(c.user_id, viewer))
      and c.created_at > now() - interval '7 days'
    group by tag
    order by count(*) desc, tag
    limit 8
  ) h;

  select coalesce(jsonb_agg(row_to_json(cr)), '[]'::jsonb) into creators
  from (
    select p.username, p.display_name, p.avatar_url, count(*) as clip_count
    from public.clips c
    join public.profiles p on p.id = c.user_id
    join public.profile_settings s on s.profile_id = p.id
    where c.status = 'published'
      and c.visibility = 'public'
      and p.deleted_at is null
      and p.deletion_status = 'active'
      and s.show_highlights
      and (viewer is null or not public.users_are_blocked(c.user_id, viewer))
      and (viewer is null or not exists (
        select 1 from public.profile_controls pc
        where pc.owner_id = viewer and pc.target_id = c.user_id and pc.kind = 'mute'
      ))
      and c.created_at > now() - interval '7 days'
    group by p.username, p.display_name, p.avatar_url
    order by count(*) desc, p.username
    limit 5
  ) cr;

  return jsonb_build_object('heroes', heroes, 'creators', creators);
end;
$$;

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
    join public.clips clip on clip.id = c.clip_id
    left join public.comments parent on parent.id = c.parent_id
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
      and (
        c.user_id = viewer
        or not exists (
          select 1 from public.profile_controls r
          where r.kind = 'restrict' and r.target_id = c.user_id and r.owner_id in (clip.user_id, parent.user_id)
        )
        or exists (
          select 1 from public.profile_controls r
          where r.kind = 'restrict' and r.target_id = c.user_id and r.owner_id = viewer
        )
      )
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.set_profile_control(uuid, text, boolean) from public;
revoke all on function public.remove_follower(uuid) from public;
revoke all on function public.list_profile_people(uuid, text, timestamptz, uuid, integer) from public;
revoke all on function public.list_relationship_profiles(text, timestamptz, uuid, integer) from public;
grant execute on function public.set_profile_control(uuid, text, boolean) to authenticated;
grant execute on function public.remove_follower(uuid) to authenticated;
grant execute on function public.list_profile_people(uuid, text, timestamptz, uuid, integer) to anon, authenticated;
grant execute on function public.list_relationship_profiles(text, timestamptz, uuid, integer) to authenticated;
