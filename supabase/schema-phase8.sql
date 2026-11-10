-- DawnClips Phase 8.
-- 1) Custom tags: explore_search also matches part of any tag, so a clip tagged "exp-lane" shows up for "exp".
-- 2) moments_for_clips: moment chips for a page of clips in one call (feed cards show them under the text).
-- Safe to run more than once.

create or replace function public.explore_search(query text default null, tags text[] default null, page_limit integer default 18)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer uuid := public.requesting_profile_id();
  needle text := nullif(left(btrim(coalesce(query, '')), 80), '');
  safe_tags text[] := coalesce((
    select array_agg(u.t) from (
      select distinct x.t from unnest(coalesce(tags, '{}'::text[])) as x(t)
      where x.t ~ '^[a-z0-9-]{1,40}$'
      limit 60
    ) u
  ), '{}'::text[]);
  tag_needle text := nullif(left(btrim(regexp_replace(lower(coalesce(query, '')), '[^a-z0-9]+', '-', 'g'), '-'), 40), '');
  has_query boolean;
  lim integer := least(greatest(coalesce(page_limit, 18), 1), 30);
  found_clips jsonb;
  found_players jsonb := '[]'::jsonb;
begin
  if needle is not null then
    needle := replace(replace(needle, '%', ''), '_', '');
    needle := nullif(needle, '');
  end if;
  has_query := needle is not null or array_length(safe_tags, 1) is not null;

  select coalesce(jsonb_agg(public.clip_row_json(c, p) order by r.ord), '[]'::jsonb)
  into found_clips
  from (
    select
      c.id,
      row_number() over (
        order by (c.hero_tags && safe_tags) desc,
          case when has_query then null else (c.likes_count * 3 + c.comments_count * 5 + c.views_count) end desc nulls last,
          c.created_at desc
      ) as ord
    from public.clips c
    join public.profiles p on p.id = c.user_id
    join public.profile_settings s on s.profile_id = p.id
    where c.status = 'published'
      and c.visibility = 'public'
      and p.deleted_at is null
      and p.deletion_status = 'active'
      and s.show_highlights
      and (viewer is null or not public.users_are_blocked(viewer, c.user_id))
      and (
        not has_query
        or (c.hero_tags && safe_tags)
        or (
          tag_needle is not null and exists (
            select 1 from unnest(c.hero_tags) as x(t) where x.t like '%' || tag_needle || '%'
          )
        )
        or (
          needle is not null and (
            c.title ilike '%' || needle || '%'
            or c.description ilike '%' || needle || '%'
            or p.username ilike '%' || needle || '%'
            or p.display_name ilike '%' || needle || '%'
          )
        )
      )
    order by 2
    limit lim
  ) r
  join public.clips c on c.id = r.id
  join public.profiles p on p.id = c.user_id;

  if needle is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'username', p.username,
      'display_name', p.display_name,
      'avatar_url', p.avatar_url,
      'bio', p.bio
    ) order by p.username), '[]'::jsonb)
    into found_players
    from (
      select * from public.profiles p
      where p.deleted_at is null
        and p.deletion_status = 'active'
        and (viewer is null or viewer = p.id or not public.users_are_blocked(viewer, p.id))
        and (p.username ilike '%' || needle || '%' or p.display_name ilike '%' || needle || '%')
      order by p.username
      limit 6
    ) p;
  end if;

  return jsonb_build_object('clips', found_clips, 'players', found_players);
end;
$$;

create or replace function public.moments_for_clips(ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer uuid := public.requesting_profile_id();
begin
  if ids is null then
    return '{}'::jsonb;
  end if;
  return coalesce((
    select jsonb_object_agg(g.clip_id, g.items)
    from (
      select m.clip_id,
        jsonb_agg(jsonb_build_object('id', m.id, 'at', m.at_seconds, 'label', m.label) order by m.at_seconds, m.created_at) as items
      from public.clip_moments m
      join public.clips c on c.id = m.clip_id
      where m.clip_id = any (ids[1:50])
        and c.status = 'published'
        and (c.visibility = 'public' or c.user_id = viewer)
      group by m.clip_id
    ) g
  ), '{}'::jsonb);
end;
$$;

revoke all on function public.explore_search(text, text[], integer) from public;
revoke all on function public.moments_for_clips(uuid[]) from public;
grant execute on function public.explore_search(text, text[], integer) to anon, authenticated;
grant execute on function public.moments_for_clips(uuid[]) to anon, authenticated;
