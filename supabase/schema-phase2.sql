-- Phase 2 delta. Run this if schema.sql was already applied before clip playback functions existed.
-- Fresh installs should run schema.sql only.

alter table public.clips add column if not exists thumbnail_object_key text;

drop policy if exists clips_select_public on public.clips;
create policy clips_select_public on public.clips
  for select to anon, authenticated
  using (
    status = 'published'
    and visibility = 'public'
    and exists (
      select 1
      from public.profiles p
      join public.profile_settings s on s.profile_id = p.id
      where p.id = clips.user_id
        and p.deleted_at is null
        and p.deletion_status = 'active'
        and s.show_highlights
    )
    and (
      (select public.requesting_profile_id()) is null
      or not public.users_are_blocked(clips.user_id, (select public.requesting_profile_id()))
    )
  );

grant execute on function public.requesting_clerk_id() to anon, authenticated;
grant execute on function public.requesting_profile_id() to anon, authenticated;
grant execute on function public.users_are_blocked(uuid, uuid) to anon, authenticated;

create table if not exists public.clip_views (
  clip_id uuid not null references public.clips (id) on delete cascade,
  viewer_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (clip_id, viewer_id)
);

alter table public.clip_views enable row level security;

create or replace function public.clip_is_visible(target uuid, viewer uuid, allow_unlisted boolean)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.clips c
    join public.profiles p on p.id = c.user_id
    join public.profile_settings s on s.profile_id = p.id
    where c.id = target
      and c.status = 'published'
      and p.deleted_at is null
      and p.deletion_status = 'active'
      and (
        (viewer is not null and c.user_id = viewer)
        or (
          s.show_highlights
          and (
            c.visibility = 'public'
            or (allow_unlisted and c.visibility = 'unlisted')
          )
          and (viewer is null or not public.users_are_blocked(c.user_id, viewer))
        )
      )
  )
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
security invoker
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
      c.user_id,
      p.username,
      p.display_name,
      p.avatar_url,
      case
        when feed in ('foryou', 'trending') then
          (c.likes_count * 3 + c.comments_count * 5 + c.views_count)::numeric
          / power(extract(epoch from (now() - c.created_at)) / 3600 + 2, 1.2)
        else null
      end as score
    from public.clips c
    join public.profiles p on p.id = c.user_id
    where c.status = 'published'
      and c.visibility = 'public'
      and exists (
        select 1 from public.profile_settings s
        where s.profile_id = c.user_id and s.show_highlights
      )
      and (feed <> 'trending' or c.created_at > now() - interval '7 days')
      and (
        feed <> 'following'
        or c.user_id in (select following_id from public.follows where follower_id = viewer)
      )
      and (
        case
          when feed in ('foryou', 'trending') then
            cursor_score is null
            or (
              (c.likes_count * 3 + c.comments_count * 5 + c.views_count)::numeric
              / power(extract(epoch from (now() - c.created_at)) / 3600 + 2, 1.2)
            ) < cursor_score
            or (
              (
                (c.likes_count * 3 + c.comments_count * 5 + c.views_count)::numeric
                / power(extract(epoch from (now() - c.created_at)) / 3600 + 2, 1.2)
              ) = cursor_score
              and c.id < cursor_id
            )
          else
            cursor_at is null
            or c.created_at < cursor_at
            or (c.created_at = cursor_at and c.id < cursor_id)
        end
      )
    order by
      case when feed in ('foryou', 'trending') then
        (c.likes_count * 3 + c.comments_count * 5 + c.views_count)::numeric
        / power(extract(epoch from (now() - c.created_at)) / 3600 + 2, 1.2)
      end desc nulls last,
      case when feed in ('latest', 'following') then c.created_at end desc nulls last,
      c.id desc
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
security invoker
set search_path = public
as $$
declare
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
security invoker
set search_path = public
as $$
declare
  heroes jsonb;
  creators jsonb;
begin
  select coalesce(jsonb_agg(row_to_json(h)), '[]'::jsonb) into heroes
  from (
    select tag as hero_id, count(*) as clip_count
    from public.clips c, unnest(c.hero_tags) as tag
    where c.status = 'published'
      and c.visibility = 'public'
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
    where c.status = 'published'
      and c.visibility = 'public'
      and c.created_at > now() - interval '7 days'
    group by p.username, p.display_name, p.avatar_url
    order by count(*) desc, p.username
    limit 5
  ) cr;

  return jsonb_build_object('heroes', heroes, 'creators', creators);
end;
$$;

create or replace function public.authorize_clip_playback(target uuid, clerk_user_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer uuid;
  found_clip public.clips;
begin
  if clerk_user_id is not null then
    select id into viewer
    from public.profiles
    where profiles.clerk_user_id = authorize_clip_playback.clerk_user_id
      and deletion_status <> 'deleted';
  end if;

  select * into found_clip from public.clips where id = target;
  if not found or found_clip.r2_object_key is null or found_clip.status = 'removed' then
    return null;
  end if;

  if not (
    (viewer is not null and found_clip.user_id = viewer)
    or public.clip_is_visible(target, viewer, true)
  ) then
    return null;
  end if;

  return (
    select jsonb_build_object(
      'object_key', found_clip.r2_object_key,
      'thumbnail_key', found_clip.thumbnail_object_key,
      'visibility', found_clip.visibility,
      'status', found_clip.status,
      'id', found_clip.id,
      'title', found_clip.title,
      'description', found_clip.description,
      'hero_tags', found_clip.hero_tags,
      'duration', found_clip.duration,
      'thumbnail_url', found_clip.thumbnail_url,
      'views_count', found_clip.views_count,
      'likes_count', found_clip.likes_count,
      'comments_count', found_clip.comments_count,
      'created_at', found_clip.created_at,
      'user_id', p.id,
      'username', p.username,
      'display_name', p.display_name,
      'avatar_url', p.avatar_url
    )
    from public.profiles p
    where p.id = found_clip.user_id
  );
end;
$$;

create or replace function public.record_clip_view(target uuid, clerk_user_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer uuid;
  inserted integer;
begin
  if clerk_user_id is not null then
    select id into viewer
    from public.profiles
    where profiles.clerk_user_id = record_clip_view.clerk_user_id
      and deletion_status = 'active';
  end if;

  if not public.clip_is_visible(target, viewer, true) then
    return;
  end if;

  if viewer is not null then
    insert into public.clip_views (clip_id, viewer_id)
    values (target, viewer)
    on conflict do nothing;
    get diagnostics inserted = row_count;
    if inserted = 0 then
      return;
    end if;
  end if;

  perform set_config('dawnclips.allow_counter_write', 'on', true);
  update public.clips
  set views_count = views_count + 1
  where id = target;
end;
$$;

revoke all on function public.clip_is_visible(uuid, uuid, boolean) from public;
revoke all on function public.list_feed(text, timestamptz, uuid, numeric, integer) from public;
revoke all on function public.related_clips(uuid, integer) from public;
revoke all on function public.trending_sidebar() from public;
revoke all on function public.authorize_clip_playback(uuid, text) from public;
revoke all on function public.record_clip_view(uuid, text) from public;

grant execute on function public.list_feed(text, timestamptz, uuid, numeric, integer) to anon, authenticated;
grant execute on function public.related_clips(uuid, integer) to anon, authenticated;
grant execute on function public.trending_sidebar() to anon, authenticated;
grant execute on function public.authorize_clip_playback(uuid, text) to service_role;
grant execute on function public.record_clip_view(uuid, text) to service_role;
grant execute on function public.clip_is_visible(uuid, uuid, boolean) to service_role;
