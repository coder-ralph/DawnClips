-- Phase 4 discovery, profile tabs, and settings guards. Run after schema-phase3.sql.

create or replace function public.protect_settings_update()
returns trigger
language plpgsql
as $$
begin
  if current_user not in ('service_role', 'postgres', 'supabase_admin') then
    new.profile_id = old.profile_id;
    new.web_push_enabled = false;
    new.created_at = old.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists settings_protect on public.profile_settings;
create trigger settings_protect before update on public.profile_settings
  for each row execute function public.protect_settings_update();

create or replace function public.search_explore(
  query text default null,
  hero text default null,
  kind text default 'clips',
  page_limit integer default 12
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer uuid := public.requesting_profile_id();
  needle text := nullif(left(btrim(coalesce(query, '')), 80), '');
  hero_id text := nullif(lower(btrim(coalesce(hero, ''))), '');
  lim integer := least(greatest(coalesce(page_limit, 12), 1), 24);
begin
  if kind not in ('clips', 'players', 'heroes') then
    raise exception 'invalid search' using errcode = '22023';
  end if;
  if hero_id is not null and hero_id !~ '^[a-z0-9-]{1,40}$' then
    raise exception 'invalid search' using errcode = '22023';
  end if;
  if needle is not null then
    needle := replace(replace(needle, '%', ''), '_', '');
  end if;

  if kind = 'players' then
    return coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'username', p.username,
        'display_name', p.display_name,
        'avatar_url', p.avatar_url,
        'bio', p.bio
      ) order by p.username)
      from (
        select * from public.profiles p
        where p.deleted_at is null
          and p.deletion_status = 'active'
          and (viewer is null or viewer = p.id or not public.users_are_blocked(viewer, p.id))
          and (
            needle is null
            or p.username ilike '%' || needle || '%'
            or p.display_name ilike '%' || needle || '%'
          )
        order by p.username
        limit lim
      ) p
    ), '[]'::jsonb);
  end if;

  if kind = 'heroes' then
    return coalesce((
      select jsonb_agg(jsonb_build_object('hero_id', h.tag, 'clip_count', h.clip_count) order by h.clip_count desc, h.tag)
      from (
        select tag, count(*) as clip_count
        from public.clips c
        join public.profile_settings s on s.profile_id = c.user_id
        cross join lateral unnest(c.hero_tags) as tag
        where c.status = 'published'
          and c.visibility = 'public'
          and s.show_highlights
          and (hero_id is null or tag = hero_id)
          and (needle is null or tag ilike '%' || needle || '%')
          and (viewer is null or not public.users_are_blocked(viewer, c.user_id))
        group by tag
        order by count(*) desc, tag
        limit lim
      ) h
    ), '[]'::jsonb);
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id,
      'title', c.title,
      'hero_tags', c.hero_tags,
      'views_count', c.views_count,
      'likes_count', c.likes_count,
      'created_at', c.created_at,
      'username', p.username,
      'display_name', p.display_name,
      'avatar_url', p.avatar_url
    ) order by c.created_at desc)
    from (
      select c.*
      from public.clips c
      join public.profiles p on p.id = c.user_id
      join public.profile_settings s on s.profile_id = p.id
      where c.status = 'published'
        and c.visibility = 'public'
        and p.deleted_at is null
        and p.deletion_status = 'active'
        and s.show_highlights
        and (hero_id is null or hero_id = any(c.hero_tags))
        and (
          needle is null
          or c.title ilike '%' || needle || '%'
          or p.username ilike '%' || needle || '%'
        )
        and (viewer is null or not public.users_are_blocked(viewer, c.user_id))
      order by c.created_at desc
      limit lim
    ) c
    join public.profiles p on p.id = c.user_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.profile_activity(target uuid, tab text, page_limit integer default 12)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer uuid := public.requesting_profile_id();
  owner boolean := viewer = target;
  settings public.profile_settings;
  lim integer := least(greatest(coalesce(page_limit, 12), 1), 24);
begin
  if tab not in ('highlights', 'liked', 'comments', 'following', 'followers') then
    raise exception 'invalid tab' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = target and deleted_at is null and deletion_status = 'active'
  ) then
    return '[]'::jsonb;
  end if;
  if viewer is not null and viewer <> target and public.users_are_blocked(viewer, target) then
    return '[]'::jsonb;
  end if;

  select * into settings from public.profile_settings where profile_id = target;
  if tab = 'highlights' and not owner and not coalesce(settings.show_highlights, true) then
    return '[]'::jsonb;
  end if;
  if tab = 'liked' and not owner and not coalesce(settings.show_likes, true) then
    return '[]'::jsonb;
  end if;
  if tab = 'comments' and not owner and not coalesce(settings.show_comments, true) then
    return '[]'::jsonb;
  end if;
  if tab = 'following' and not owner and not coalesce(settings.show_following, true) then
    return '[]'::jsonb;
  end if;
  if tab = 'followers' and not owner and not coalesce(settings.show_followers, true) then
    return '[]'::jsonb;
  end if;

  if tab = 'highlights' then
    return coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'title', c.title, 'visibility', c.visibility, 'views_count', c.views_count, 'created_at', c.created_at
      ) order by c.created_at desc)
      from (
        select * from public.clips c
        where c.user_id = target
          and c.status = 'published'
          and (owner or (c.visibility = 'public' and (viewer is null or not public.users_are_blocked(viewer, c.user_id))))
        order by c.created_at desc
        limit lim
      ) c
    ), '[]'::jsonb);
  end if;

  if tab = 'liked' then
    return coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'title', c.title, 'username', p.username, 'display_name', p.display_name, 'created_at', l.created_at
      ) order by l.created_at desc)
      from public.likes l
      join public.clips c on c.id = l.clip_id
      join public.profiles p on p.id = c.user_id
      where l.user_id = target
        and c.status = 'published'
        and (
          c.user_id = viewer
          or (c.visibility = 'public' and (viewer is null or not public.users_are_blocked(viewer, c.user_id)))
        )
      limit lim
    ), '[]'::jsonb);
  end if;

  if tab = 'comments' then
    return coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'clip_id', c.clip_id, 'content', c.content, 'created_at', c.created_at, 'title', cl.title
      ) order by c.created_at desc)
      from public.comments c
      join public.clips cl on cl.id = c.clip_id
      where c.user_id = target
        and c.deleted_at is null
        and cl.status = 'published'
        and (
          cl.user_id = viewer
          or (cl.visibility = 'public' and (viewer is null or not public.users_are_blocked(viewer, cl.user_id)))
        )
      limit lim
    ), '[]'::jsonb);
  end if;

  if tab = 'following' then
    return coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'username', p.username, 'display_name', p.display_name, 'avatar_url', p.avatar_url
      ) order by p.username)
      from public.follows f
      join public.profiles p on p.id = f.following_id
      where f.follower_id = target
        and p.deleted_at is null
        and (viewer is null or viewer = p.id or not public.users_are_blocked(viewer, p.id))
      limit lim
    ), '[]'::jsonb);
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id, 'username', p.username, 'display_name', p.display_name, 'avatar_url', p.avatar_url
    ) order by p.username)
    from public.follows f
    join public.profiles p on p.id = f.follower_id
    where f.following_id = target
      and p.deleted_at is null
      and (viewer is null or viewer = p.id or not public.users_are_blocked(viewer, p.id))
    limit lim
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.protect_settings_update() from public;
revoke all on function public.search_explore(text, text, text, integer) from public;
revoke all on function public.profile_activity(uuid, text, integer) from public;
grant execute on function public.search_explore(text, text, text, integer) to anon, authenticated;
grant execute on function public.profile_activity(uuid, text, integer) to anon, authenticated;
