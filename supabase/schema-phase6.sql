-- Phase 6. Run after schema-phase5.sql. Safe to re-run.
--
-- Additive only: new nullable columns on public.clips, new tables, new and
-- replaced functions. No existing table, RLS policy or grant is removed or
-- loosened. Adds:
--   * 15-minute clip edit window (enforced in the database)
--   * Pin to profile (one pinned clip per creator)
--   * Clip moments (timestamp tags such as "Savage" or "Lord steal")
--   * Per-clip insights (watch events + engagement series)
--   * A For You ranking that includes your own and followed creators' clips
--   * Feed-shaped rows for Saved, profile tabs and Explore
--   * Public Role ID on profiles (Zone ID stays private)

alter table public.clips add column if not exists published_at timestamptz;
alter table public.clips add column if not exists edited_at timestamptz;
alter table public.clips add column if not exists pinned_at timestamptz;

update public.clips set published_at = created_at where status = 'published' and published_at is null;

create unique index if not exists clips_one_pinned_per_user on public.clips (user_id) where pinned_at is not null;

-- Guards: owners cannot move publication/edit/pin markers by hand, never reset
-- the publication time, and cannot change clip text after the 15-minute window.
-- Security-definer functions (edit_clip, set_clip_pinned) run as the table owner
-- and are exempt, so they are the only supported write path for those columns.
create or replace function public.guard_clip_changes()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    if new.status = 'published' and old.status is distinct from 'published' then
      new.published_at = coalesce(old.published_at, now());
    end if;
    if current_user not in ('service_role', 'postgres', 'supabase_admin') then
      new.published_at = case
        when new.status = 'published' and old.status is distinct from 'published' then coalesce(old.published_at, now())
        else old.published_at
      end;
      new.edited_at = old.edited_at;
      new.pinned_at = old.pinned_at;
      if (
        new.title is distinct from old.title
        or new.description is distinct from old.description
        or new.hero_tags is distinct from old.hero_tags
      ) and old.published_at is not null
        and now() > old.published_at + interval '15 minutes' then
        raise exception 'edit window closed' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_clip_changes on public.clips;
create trigger guard_clip_changes
  before update on public.clips
  for each row execute function public.guard_clip_changes();

-- ---------------------------------------------------------------------------
-- Edit + pin
-- ---------------------------------------------------------------------------

create or replace function public.edit_clip(target uuid, new_title text, new_description text, new_tags text[])
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer uuid := public.requesting_profile_id();
  clip public.clips;
  clean_title text := btrim(coalesce(new_title, ''));
  clean_description text := btrim(coalesce(new_description, ''));
  clean_tags text[] := coalesce(new_tags, '{}');
  tag text;
  changed boolean;
begin
  if viewer is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if char_length(clean_title) not between 1 and 120 or char_length(clean_description) > 2000 then
    raise exception 'invalid clip' using errcode = '22023';
  end if;
  if coalesce(array_length(clean_tags, 1), 0) > 5 then
    raise exception 'invalid clip' using errcode = '22023';
  end if;
  foreach tag in array clean_tags loop
    if tag !~ '^[a-z0-9-]{1,40}$' then
      raise exception 'invalid clip' using errcode = '22023';
    end if;
  end loop;

  select * into clip from public.clips where id = target and user_id = viewer for update;
  if not found or clip.status <> 'published' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if now() > coalesce(clip.published_at, clip.created_at) + interval '15 minutes' then
    raise exception 'edit window closed' using errcode = '42501';
  end if;

  changed := clip.title is distinct from clean_title
    or clip.description is distinct from clean_description
    or clip.hero_tags is distinct from clean_tags;

  if changed then
    update public.clips
    set title = clean_title,
        description = clean_description,
        hero_tags = clean_tags,
        edited_at = now()
    where id = target
    returning * into clip;
  end if;

  return jsonb_build_object(
    'id', clip.id,
    'title', clip.title,
    'description', clip.description,
    'hero_tags', clip.hero_tags,
    'edited_at', clip.edited_at,
    'editable_until', coalesce(clip.published_at, clip.created_at) + interval '15 minutes'
  );
end;
$$;

create or replace function public.set_clip_pinned(target uuid, should_pin boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer uuid := public.requesting_profile_id();
  clip public.clips;
begin
  if viewer is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  select * into clip from public.clips where id = target and user_id = viewer for update;
  if not found or clip.status <> 'published' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if should_pin and clip.visibility <> 'public' then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  update public.clips set pinned_at = null where user_id = viewer and pinned_at is not null and id <> target;
  update public.clips set pinned_at = case when should_pin then now() else null end where id = target;
  return jsonb_build_object('pinned', should_pin);
end;
$$;

-- ---------------------------------------------------------------------------
-- Row formatter shared by Saved, profile tabs and Explore
-- ---------------------------------------------------------------------------

create or replace function public.clip_row_json(c public.clips, p public.profiles)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id', c.id,
    'title', c.title,
    'description', c.description,
    'hero_tags', c.hero_tags,
    'duration', c.duration,
    'thumbnail_url', c.thumbnail_url,
    'views_count', c.views_count,
    'likes_count', c.likes_count,
    'comments_count', c.comments_count,
    'created_at', c.created_at,
    'edited_at', c.edited_at,
    'editable_until', coalesce(c.published_at, c.created_at) + interval '15 minutes',
    'pinned_at', c.pinned_at,
    'visibility', c.visibility,
    'comments_mode', c.comments_mode,
    'user_id', c.user_id,
    'username', p.username,
    'display_name', p.display_name,
    'avatar_url', p.avatar_url
  )
$$;

-- ---------------------------------------------------------------------------
-- NOTE: list_feed, related_clips and trending_sidebar used to run as the caller.
-- clips_select_public joins profiles/profile_settings, whose own RLS only shows
-- the caller's row, so viewers only ever saw their own clips. They now run as
-- definer and apply the visibility, deletion and block rules explicitly.
--
-- For You: everyone, with a freshness base and a boost for your own clips and
-- creators you follow, so new posts are not buried under older viral ones.
-- ---------------------------------------------------------------------------

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
      and c.created_at > now() - interval '7 days'
    group by p.username, p.display_name, p.avatar_url
    order by count(*) desc, p.username
    limit 5
  ) cr;

  return jsonb_build_object('heroes', heroes, 'creators', creators);
end;
$$;

-- ---------------------------------------------------------------------------
-- Saved: full feed-shaped rows so posts can be played in place
-- ---------------------------------------------------------------------------

create or replace function public.list_saved_clips(page_limit integer default 20)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer uuid := public.requesting_profile_id();
  lim integer := least(greatest(coalesce(page_limit, 20), 1), 50);
begin
  if viewer is null then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(public.clip_row_json(c, p) || jsonb_build_object('saved_at', b.created_at) order by b.created_at desc)
    from (
      select b.*
      from public.bookmarks b
      where b.user_id = viewer
      order by b.created_at desc
      limit lim
    ) b
    join public.clips c on c.id = b.clip_id
    join public.profiles p on p.id = c.user_id
    where c.status = 'published'
      and (c.user_id = viewer or public.clip_is_visible(c.id, viewer, true))
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Profile tabs as feed-shaped rows (pinned clip first on Highlights)
-- ---------------------------------------------------------------------------

create or replace function public.profile_clips(target uuid, tab text, page_limit integer default 12)
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
  lim integer := least(greatest(coalesce(page_limit, 12), 1), 24);
begin
  if tab not in ('highlights', 'liked') then
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

  if tab = 'highlights' then
    return coalesce((
      select jsonb_agg(public.clip_row_json(c, p) order by r.ord)
      from (
        select c.id, row_number() over (order by (c.pinned_at is not null) desc, c.created_at desc) as ord
        from public.clips c
        where c.user_id = target
          and c.status = 'published'
          and (owner or (c.visibility = 'public' and (viewer is null or not public.users_are_blocked(viewer, c.user_id))))
        order by (c.pinned_at is not null) desc, c.created_at desc
        limit lim
      ) r
      join public.clips c on c.id = r.id
      join public.profiles p on p.id = c.user_id
    ), '[]'::jsonb);
  end if;

  return coalesce((
    select jsonb_agg(public.clip_row_json(c, p) order by l.created_at desc)
    from (
      select * from public.likes l
      where l.user_id = target
      order by l.created_at desc
      limit lim * 2
    ) l
    join public.clips c on c.id = l.clip_id
    join public.profiles p on p.id = c.user_id
    where c.status = 'published'
      and (
        c.user_id = viewer
        or (c.visibility = 'public' and (viewer is null or not public.users_are_blocked(viewer, c.user_id)))
      )
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Explore: one search for clips and players. `tags` are hero ids that the
-- client resolved from a hero name, role or lane typed into the search box.
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- Public profile now exposes Role ID. Zone ID is intentionally not returned.
-- ---------------------------------------------------------------------------

create or replace function public.get_public_profile(lookup text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer uuid := public.requesting_profile_id();
  row public.profiles;
  settings public.profile_settings;
  is_owner boolean;
  highlights_visible boolean;
  following_visible boolean;
  followers_visible boolean;
begin
  if lookup is null or char_length(lookup) > 40 then
    return null;
  end if;

  select * into row
  from public.profiles
  where deleted_at is null
    and deletion_status = 'active'
    and (id::text = lookup or username = lower(lookup))
  limit 1;

  if not found then
    return null;
  end if;

  if viewer is not null and viewer <> row.id and public.users_are_blocked(viewer, row.id) then
    return null;
  end if;

  select * into settings from public.profile_settings where profile_id = row.id;
  is_owner := viewer = row.id;
  highlights_visible := is_owner or coalesce(settings.show_highlights, true);
  following_visible := is_owner or coalesce(settings.show_following, true);
  followers_visible := is_owner or coalesce(settings.show_followers, true);

  return jsonb_build_object(
    'id', row.id,
    'display_name', row.display_name,
    'username', row.username,
    'avatar_url', row.avatar_url,
    'bio', row.bio,
    'role_id', row.role_id,
    'country', row.country,
    'created_at', row.created_at,
    'is_own', is_owner,
    'show_highlights', highlights_visible,
    'show_following', following_visible,
    'show_followers', followers_visible,
    'show_comments', is_owner or coalesce(settings.show_comments, true),
    'show_likes', is_owner or coalesce(settings.show_likes, true),
    'clips_count', case when highlights_visible then (
      select count(*) from public.clips c
      where c.user_id = row.id and c.status = 'published' and c.visibility = 'public'
    ) else null end,
    'followers_count', case when followers_visible then (
      select count(*) from public.follows f where f.following_id = row.id
    ) else null end,
    'following_count', case when following_visible then (
      select count(*) from public.follows f where f.follower_id = row.id
    ) else null end
  );
end;
$$;

-- Clip detail now carries comment mode and edit/pin markers.

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
      'comments_mode', found_clip.comments_mode,
      'edited_at', found_clip.edited_at,
      'editable_until', coalesce(found_clip.published_at, found_clip.created_at) + interval '15 minutes',
      'pinned_at', found_clip.pinned_at,
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

-- ---------------------------------------------------------------------------
-- Moments (timestamp tags)
-- ---------------------------------------------------------------------------

create table if not exists public.clip_moments (
  id uuid primary key default gen_random_uuid(),
  clip_id uuid not null references public.clips (id) on delete cascade,
  at_seconds integer not null check (at_seconds between 0 and 86400),
  label text not null check (char_length(label) between 1 and 24),
  created_at timestamptz not null default now()
);

create index if not exists clip_moments_clip_idx on public.clip_moments (clip_id, at_seconds);
alter table public.clip_moments enable row level security;
revoke all on table public.clip_moments from anon, authenticated;

create or replace function public.list_clip_moments(target uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer uuid := public.requesting_profile_id();
begin
  if not (
    public.clip_is_visible(target, viewer, true)
    or exists (select 1 from public.clips where id = target and user_id = viewer and status = 'published')
  ) then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', m.id, 'at', m.at_seconds, 'label', m.label) order by m.at_seconds, m.created_at)
    from public.clip_moments m
    where m.clip_id = target
  ), '[]'::jsonb);
end;
$$;

create or replace function public.set_clip_moments(target uuid, moments jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer uuid := public.requesting_profile_id();
  item jsonb;
  at_value integer;
  label_value text;
begin
  if viewer is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if not exists (select 1 from public.clips where id = target and user_id = viewer and status = 'published') then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if moments is null or jsonb_typeof(moments) <> 'array' or jsonb_array_length(moments) > 8 then
    raise exception 'invalid clip' using errcode = '22023';
  end if;

  delete from public.clip_moments where clip_id = target;
  for item in select * from jsonb_array_elements(moments) loop
    at_value := (item ->> 'at')::integer;
    label_value := btrim(coalesce(item ->> 'label', ''));
    if at_value is null or at_value < 0 or at_value > 86400 or char_length(label_value) not between 1 and 24 then
      raise exception 'invalid clip' using errcode = '22023';
    end if;
    insert into public.clip_moments (clip_id, at_seconds, label) values (target, at_value, label_value);
  end loop;
  return public.list_clip_moments(target);
end;
$$;

-- ---------------------------------------------------------------------------
-- Insights
-- ---------------------------------------------------------------------------

create table if not exists public.clip_watch_events (
  id bigint generated always as identity primary key,
  clip_id uuid not null references public.clips (id) on delete cascade,
  viewer_id uuid references public.profiles (id) on delete set null,
  watch_seconds integer not null check (watch_seconds between 0 and 21600),
  created_at timestamptz not null default now()
);

create index if not exists clip_watch_events_clip_idx on public.clip_watch_events (clip_id, created_at);
alter table public.clip_watch_events enable row level security;
revoke all on table public.clip_watch_events from anon, authenticated;

create or replace function public.record_clip_watch(target uuid, clerk_user_id text, seconds integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer uuid;
  clip_duration integer;
begin
  if seconds is null or seconds <= 0 then
    return;
  end if;
  if clerk_user_id is not null then
    select id into viewer
    from public.profiles
    where profiles.clerk_user_id = record_clip_watch.clerk_user_id
      and deletion_status = 'active';
  end if;
  if not public.clip_is_visible(target, viewer, true) then
    return;
  end if;
  select duration into clip_duration from public.clips where id = target;
  insert into public.clip_watch_events (clip_id, viewer_id, watch_seconds)
  values (target, viewer, least(seconds, 21600, coalesce(clip_duration * 10, 21600)));
end;
$$;

create or replace function public.clip_insights(target uuid, days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer uuid := public.requesting_profile_id();
  span integer := case when days in (7, 30, 90) then days else 30 end;
  today timestamptz := date_trunc('day', now());
  since timestamptz;
  prev_since timestamptz;
  clip public.clips;
  published timestamptz;
  cur jsonb;
  prev jsonb;
  daily jsonb;
begin
  if viewer is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  select * into clip from public.clips where id = target and user_id = viewer;
  if not found then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  since := today - ((span - 1) * interval '1 day');
  prev_since := since - (span * interval '1 day');
  published := coalesce(clip.published_at, clip.created_at);

  select jsonb_build_object(
    'plays', (select count(*) from public.clip_watch_events w where w.clip_id = target and w.created_at >= since),
    'viewers', (select count(distinct w.viewer_id) from public.clip_watch_events w where w.clip_id = target and w.created_at >= since),
    'watch_seconds', (select coalesce(sum(w.watch_seconds), 0) from public.clip_watch_events w where w.clip_id = target and w.created_at >= since),
    'likes', (select count(*) from public.likes l where l.clip_id = target and l.created_at >= since),
    'comments', (select count(*) from public.comments m where m.clip_id = target and m.deleted_at is null and m.created_at >= since),
    'saves', (select count(*) from public.bookmarks b where b.clip_id = target and b.created_at >= since)
  ) into cur;

  select jsonb_build_object(
    'plays', (select count(*) from public.clip_watch_events w where w.clip_id = target and w.created_at >= prev_since and w.created_at < since),
    'watch_seconds', (select coalesce(sum(w.watch_seconds), 0) from public.clip_watch_events w where w.clip_id = target and w.created_at >= prev_since and w.created_at < since),
    'likes', (select count(*) from public.likes l where l.clip_id = target and l.created_at >= prev_since and l.created_at < since),
    'comments', (select count(*) from public.comments m where m.clip_id = target and m.deleted_at is null and m.created_at >= prev_since and m.created_at < since),
    'saves', (select count(*) from public.bookmarks b where b.clip_id = target and b.created_at >= prev_since and b.created_at < since)
  ) into prev;

  select coalesce(jsonb_agg(jsonb_build_object(
    'day', d.day::date,
    'plays', (select count(*) from public.clip_watch_events w where w.clip_id = target and w.created_at >= d.day and w.created_at < d.day + interval '1 day'),
    'engagements',
      (select count(*) from public.likes l where l.clip_id = target and l.created_at >= d.day and l.created_at < d.day + interval '1 day')
      + (select count(*) from public.comments m where m.clip_id = target and m.deleted_at is null and m.created_at >= d.day and m.created_at < d.day + interval '1 day')
      + (select count(*) from public.bookmarks b where b.clip_id = target and b.created_at >= d.day and b.created_at < d.day + interval '1 day')
  ) order by d.day), '[]'::jsonb)
  into daily
  from generate_series(since, today, interval '1 day') as d(day);

  return jsonb_build_object(
    'days', span,
    'current', cur,
    'previous', prev,
    'daily', daily,
    'lifetime_views', clip.views_count,
    'lifetime_likes', clip.likes_count,
    'lifetime_comments', clip.comments_count,
    'first_hour', (
      (select count(*) from public.likes l where l.clip_id = target and l.created_at < published + interval '1 hour')
      + (select count(*) from public.comments m where m.clip_id = target and m.deleted_at is null and m.created_at < published + interval '1 hour')
      + (select count(*) from public.bookmarks b where b.clip_id = target and b.created_at < published + interval '1 hour')
    ),
    'first_day', (
      (select count(*) from public.likes l where l.clip_id = target and l.created_at < published + interval '1 day')
      + (select count(*) from public.comments m where m.clip_id = target and m.deleted_at is null and m.created_at < published + interval '1 day')
      + (select count(*) from public.bookmarks b where b.clip_id = target and b.created_at < published + interval '1 day')
    ),
    'tracking_started', (select min(w.created_at) from public.clip_watch_events w where w.clip_id = target)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function public.guard_clip_changes() from public;
revoke all on function public.edit_clip(uuid, text, text, text[]) from public;
revoke all on function public.set_clip_pinned(uuid, boolean) from public;
revoke all on function public.clip_row_json(public.clips, public.profiles) from public;
revoke all on function public.profile_clips(uuid, text, integer) from public;
revoke all on function public.explore_search(text, text[], integer) from public;
revoke all on function public.list_clip_moments(uuid) from public;
revoke all on function public.set_clip_moments(uuid, jsonb) from public;
revoke all on function public.record_clip_watch(uuid, text, integer) from public;
revoke all on function public.clip_insights(uuid, integer) from public;

grant execute on function public.list_feed(text, timestamptz, uuid, numeric, integer) to anon, authenticated;
grant execute on function public.related_clips(uuid, integer) to anon, authenticated;
grant execute on function public.trending_sidebar() to anon, authenticated;
grant execute on function public.edit_clip(uuid, text, text, text[]) to authenticated;
grant execute on function public.set_clip_pinned(uuid, boolean) to authenticated;
grant execute on function public.profile_clips(uuid, text, integer) to anon, authenticated;
grant execute on function public.explore_search(text, text[], integer) to anon, authenticated;
grant execute on function public.list_clip_moments(uuid) to anon, authenticated;
grant execute on function public.set_clip_moments(uuid, jsonb) to authenticated;
grant execute on function public.record_clip_watch(uuid, text, integer) to service_role;
grant execute on function public.clip_insights(uuid, integer) to authenticated;
