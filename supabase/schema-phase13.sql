-- DawnClips Phase 13: highest rank (with stars) and favorite roles on the profile.
--
-- What this adds to public.profiles (all three are optional, so every existing profile stays as it is):
--   highest_rank   text      one of the 10 MLBB ranks, stored as a lower-case key:
--                            warrior, elite, master, grandmaster, epic, legend,
--                            mythic, mythical_honor, mythical_glory, mythical_immortal
--   rank_stars     integer   cumulative stars. MLBB only counts them from Mythic up:
--                              mythic 0-24, mythical_honor 25-49, mythical_glory 50-99, mythical_immortal 100-9999.
--                            Must be empty for the lower ranks and when no rank is set.
--   favorite_roles text[]    up to 2 of: tank, fighter, assassin, mage, marksman, support, all_rounder.
--                            No repeats, and all_rounder is always on its own.
--
-- The rules are CHECK constraints, not only form validation: profiles allows signed-in people to update their own row
-- directly, so the database is what actually enforces them. If MLBB changes the star ranges, replace
-- profiles_rank_stars_range in a new phase file.
--
-- get_public_profile() now also returns highest_rank, rank_stars and favorite_roles (public on purpose, like the
-- country). Everything else it returns, and every check it makes, is unchanged. Its grants stay as they were.
--
-- Run it in the Supabase SQL editor BEFORE deploying the code that reads these columns, after schema-phase12.sql.
-- Safe to run more than once. Nothing existing is dropped or changed.

alter table public.profiles add column if not exists highest_rank text;
alter table public.profiles add column if not exists rank_stars integer;
alter table public.profiles add column if not exists favorite_roles text[] not null default '{}';

alter table public.profiles drop constraint if exists profiles_highest_rank_valid;
alter table public.profiles add constraint profiles_highest_rank_valid check (
  highest_rank is null or highest_rank in (
    'warrior', 'elite', 'master', 'grandmaster', 'epic', 'legend',
    'mythic', 'mythical_honor', 'mythical_glory', 'mythical_immortal'
  )
);

alter table public.profiles drop constraint if exists profiles_rank_stars_range;
alter table public.profiles add constraint profiles_rank_stars_range check (
  rank_stars is null or (
    highest_rank is not null and (
      case highest_rank
        when 'mythic' then rank_stars between 0 and 24
        when 'mythical_honor' then rank_stars between 25 and 49
        when 'mythical_glory' then rank_stars between 50 and 99
        when 'mythical_immortal' then rank_stars between 100 and 9999
        else false
      end
    )
  )
);

alter table public.profiles drop constraint if exists profiles_favorite_roles_valid;
alter table public.profiles add constraint profiles_favorite_roles_valid check (
  coalesce(array_ndims(favorite_roles), 1) = 1
  and cardinality(favorite_roles) <= 2
  and favorite_roles <@ array['tank', 'fighter', 'assassin', 'mage', 'marksman', 'support', 'all_rounder']::text[]
  and (cardinality(favorite_roles) < 2 or favorite_roles[1] <> favorite_roles[2])
  and (cardinality(favorite_roles) < 2 or not ('all_rounder' = any (favorite_roles)))
);

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
    'highest_rank', row.highest_rank,
    'rank_stars', row.rank_stars,
    'favorite_roles', to_jsonb(row.favorite_roles),
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
