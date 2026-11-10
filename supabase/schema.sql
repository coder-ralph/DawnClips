-- DawnClips schema for Supabase PostgreSQL.
-- Apply in the Supabase SQL editor as a single script.
--
-- Identity: Clerk is the only authentication provider. Policies compare
-- auth.jwt()->>'sub' (the Clerk user id) and never auth.uid(). With Clerk
-- third-party auth, auth.uid() is null, so an auth.uid() policy denies every
-- row or, worse, a "is not null" check does not prove ownership.
--
-- RLS limitations (enforced here, not only in the app):
-- 1. Row policies cannot hide columns. Email, Role ID, Zone ID, and Clerk ids
--    stay on profiles, which has no public SELECT policy. Public pages must
--    call get_public_profile(), which returns only safe fields.
-- 2. Unlisted clips are not selectable through the table API. A policy that
--    allowed unlisted SELECT would also allow listing every unlisted row.
--    Playback of unlisted clips must use a later id-scoped function.
-- 3. The postgres role and the Supabase service role bypass RLS. The SQL
--    editor's default role therefore does not prove a policy works. Test as
--    the Authenticated role. Service-role clients must not also forward a
--    user access token, or Supabase applies that user's RLS instead.
-- 4. A follow row is public only when the follower allows a public following
--    list AND the followee allows a public follower list.
-- 5. Webhook user.deleted must not hard-delete profiles. R2 object keys live
--    on clips, and a database transaction cannot delete Cloudflare objects.

create extension if not exists pgcrypto;

create or replace function public.requesting_clerk_id()
returns text
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'sub', '')
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.reject_reserved_username()
returns trigger
language plpgsql
as $$
begin
  new.username = lower(btrim(new.username));
  new.display_name = btrim(new.display_name);
  if new.username in (
    'admin', 'administrator', 'api', 'clip', 'clips', 'dawnclips', 'explore',
    'help', 'login', 'logout', 'mlbb', 'moderator', 'moonton', 'notifications',
    'official', 'profile', 'settings', 'signin', 'sign-in', 'signup', 'sign-up',
    'support', 'system', 'upload', 'user', 'users'
  ) then
    raise exception 'username reserved' using errcode = '23514';
  end if;
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null unique default nullif(auth.jwt() ->> 'sub', ''),
  email text,
  email_verified boolean not null default false,
  display_name text not null,
  username text not null unique,
  avatar_url text,
  avatar_source text not null default 'clerk' check (avatar_source in ('clerk', 'custom')),
  bio text not null default '',
  role_id text,
  zone_id text,
  country text not null default 'PH',
  language text not null default 'en',
  deletion_status text not null default 'active' check (deletion_status in ('active', 'pending_deletion', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint profiles_display_name_len check (char_length(display_name) between 1 and 40),
  constraint profiles_username_format check (username ~ '^[a-z0-9_]{3,20}$'),
  constraint profiles_bio_len check (char_length(bio) <= 160),
  constraint profiles_role_id_format check (role_id is null or role_id ~ '^[0-9]{1,12}$'),
  constraint profiles_zone_id_format check (zone_id is null or zone_id ~ '^[0-9]{1,8}$'),
  constraint profiles_country_format check (country ~ '^[A-Z]{2}$'),
  constraint profiles_language_format check (language ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  constraint profiles_avatar_url_len check (avatar_url is null or char_length(avatar_url) <= 500)
);

create table public.profile_settings (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  show_highlights boolean not null default true,
  show_following boolean not null default true,
  show_followers boolean not null default true,
  show_comments boolean not null default true,
  show_likes boolean not null default true,
  in_app_notifications boolean not null default true,
  notify_likes boolean not null default true,
  notify_comments boolean not null default true,
  notify_replies boolean not null default true,
  notify_follows boolean not null default true,
  web_push_enabled boolean not null default false,
  theme text not null default 'dark' check (theme in ('light', 'dark', 'system')),
  autoplay boolean not null default true,
  default_muted boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.clips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  title text not null,
  description text not null default '',
  r2_object_key text unique,
  video_url text,
  thumbnail_url text,
  thumbnail_object_key text,
  hero_tags text[] not null default '{}',
  duration integer,
  file_size bigint,
  mime_type text,
  status text not null default 'pending' check (status in ('pending', 'processing', 'published', 'failed', 'removed')),
  visibility text not null default 'public' check (visibility in ('public', 'unlisted', 'private')),
  comments_mode text not null default 'everyone' check (comments_mode in ('everyone', 'followers', 'disabled')),
  views_count integer not null default 0,
  likes_count integer not null default 0,
  comments_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clips_title_len check (char_length(title) between 1 and 120),
  constraint clips_description_len check (char_length(description) <= 2000),
  constraint clips_duration_nonnegative check (duration is null or duration >= 0),
  constraint clips_file_size_nonnegative check (file_size is null or file_size >= 0),
  constraint clips_counts_nonnegative check (views_count >= 0 and likes_count >= 0 and comments_count >= 0)
);

create table public.likes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  clip_id uuid not null references public.clips (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, clip_id)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  clip_id uuid not null references public.clips (id) on delete cascade,
  parent_id uuid references public.comments (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint comments_content_len check (char_length(content) between 1 and 500)
);

create table public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (follower_id, following_id),
  constraint follows_no_self check (follower_id <> following_id)
);

create table public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  clip_id uuid not null references public.clips (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, clip_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  type text not null check (type in ('like', 'comment', 'reply', 'follow')),
  reference_id uuid,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  target_type text not null check (target_type in ('clip', 'comment', 'profile')),
  target_id uuid not null,
  reason text not null check (reason in ('spam', 'harassment', 'hate', 'violence', 'sexual', 'copyright', 'other')),
  description text not null default '',
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reports_description_len check (char_length(description) <= 1000)
);

create table public.blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_id),
  constraint blocks_no_self check (blocker_id <> blocked_id)
);

create table public.account_deletions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete restrict,
  clerk_user_id text not null,
  status text not null default 'pending' check (status in (
    'pending', 'collecting_objects', 'deleting_objects', 'deleting_records', 'deleting_clerk', 'completed', 'failed'
  )),
  r2_object_keys text[] not null default '{}',
  r2_deleted_keys text[] not null default '{}',
  r2_failed_keys text[] not null default '{}',
  last_error text,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.rate_limits (
  bucket text primary key,
  window_start timestamptz not null,
  hit_count integer not null check (hit_count >= 0)
);

create index profiles_created_at_idx on public.profiles (created_at desc);
create index clips_owner_created_idx on public.clips (user_id, created_at desc);
create index clips_public_feed_idx on public.clips (created_at desc)
  where status = 'published' and visibility = 'public';
create index clips_hero_tags_gin on public.clips using gin (hero_tags);
create index likes_clip_idx on public.likes (clip_id);
create index comments_clip_created_idx on public.comments (clip_id, created_at);
create index comments_parent_idx on public.comments (parent_id);
create index follows_following_idx on public.follows (following_id);
create index bookmarks_user_idx on public.bookmarks (user_id, created_at desc);
create index notifications_recipient_idx on public.notifications (recipient_id, is_read, created_at desc);
create index reports_status_idx on public.reports (status, created_at desc);
create index blocks_blocked_idx on public.blocks (blocked_id);

create or replace function public.protect_profile_identity()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and current_user not in ('service_role', 'postgres', 'supabase_admin') then
    new.clerk_user_id = old.clerk_user_id;
    new.email = old.email;
    new.email_verified = old.email_verified;
    new.deletion_status = old.deletion_status;
    new.deleted_at = old.deleted_at;
    new.created_at = old.created_at;
    if new.avatar_url is distinct from old.avatar_url then
      new.avatar_source = 'custom';
    else
      new.avatar_source = old.avatar_source;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.protect_engagement_counters()
returns trigger
language plpgsql
as $$
begin
  if current_setting('dawnclips.allow_counter_write', true) is distinct from 'on' then
    new.views_count = old.views_count;
    new.likes_count = old.likes_count;
    new.comments_count = old.comments_count;
  end if;
  return new;
end;
$$;

create or replace function public.protect_notification_update()
returns trigger
language plpgsql
as $$
begin
  if current_user not in ('service_role', 'postgres', 'supabase_admin') then
    new.recipient_id = old.recipient_id;
    new.actor_id = old.actor_id;
    new.type = old.type;
    new.reference_id = old.reference_id;
    new.created_at = old.created_at;
  end if;
  return new;
end;
$$;

create or replace function public.enforce_comment_thread()
returns trigger
language plpgsql
as $$
declare
  parent_clip uuid;
begin
  if new.parent_id is null then
    return new;
  end if;
  select clip_id into parent_clip from public.comments where id = new.parent_id;
  if parent_clip is null or parent_clip <> new.clip_id then
    raise exception 'reply must belong to the same clip' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.create_profile_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profile_settings (profile_id)
  values (new.id)
  on conflict (profile_id) do nothing;
  return new;
end;
$$;

create trigger profiles_username before insert or update of username, display_name on public.profiles
  for each row execute function public.reject_reserved_username();
create trigger profiles_identity before update on public.profiles
  for each row execute function public.protect_profile_identity();
create trigger profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger profiles_settings after insert on public.profiles
  for each row execute function public.create_profile_settings();
create trigger profile_settings_updated before update on public.profile_settings
  for each row execute function public.set_updated_at();
create trigger clips_counters before update on public.clips
  for each row execute function public.protect_engagement_counters();
create trigger clips_updated before update on public.clips
  for each row execute function public.set_updated_at();
create trigger comments_thread before insert or update on public.comments
  for each row execute function public.enforce_comment_thread();
create trigger comments_updated before update on public.comments
  for each row execute function public.set_updated_at();
create trigger reports_updated before update on public.reports
  for each row execute function public.set_updated_at();
create trigger account_deletions_updated before update on public.account_deletions
  for each row execute function public.set_updated_at();
create trigger notifications_protect before update on public.notifications
  for each row execute function public.protect_notification_update();

create or replace function public.requesting_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.profiles
  where clerk_user_id = public.requesting_clerk_id()
    and deletion_status <> 'deleted'
  limit 1
$$;

create or replace function public.users_are_blocked(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.blocks
    where (blocker_id = a and blocked_id = b)
       or (blocker_id = b and blocked_id = a)
  )
$$;

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

create or replace function public.consume_rate_limit(action text, max_hits integer, window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  actor text := public.requesting_clerk_id();
  key text;
  current_window timestamptz;
  current_hits integer;
begin
  if actor is null or action is null or max_hits < 1 or window_seconds < 1 then
    return false;
  end if;
  if char_length(action) > 40 then
    return false;
  end if;

  key := actor || ':' || action;
  select window_start, hit_count into current_window, current_hits
  from public.rate_limits
  where bucket = key
  for update;

  if not found then
    insert into public.rate_limits (bucket, window_start, hit_count)
    values (key, now(), 1);
    return true;
  end if;

  if current_window < now() - make_interval(secs => window_seconds) then
    update public.rate_limits
    set window_start = now(), hit_count = 1
    where bucket = key;
    return true;
  end if;

  if current_hits >= max_hits then
    return false;
  end if;

  update public.rate_limits
  set hit_count = hit_count + 1
  where bucket = key;
  return true;
end;
$$;

revoke all on function public.requesting_clerk_id() from public;
revoke all on function public.requesting_profile_id() from public;
revoke all on function public.users_are_blocked(uuid, uuid) from public;
revoke all on function public.get_public_profile(text) from public;
revoke all on function public.consume_rate_limit(text, integer, integer) from public;
revoke all on function public.create_profile_settings() from public;
revoke all on function public.protect_profile_identity() from public;
revoke all on function public.protect_engagement_counters() from public;
revoke all on function public.protect_notification_update() from public;
revoke all on function public.enforce_comment_thread() from public;
revoke all on function public.reject_reserved_username() from public;
revoke all on function public.set_updated_at() from public;

grant execute on function public.requesting_clerk_id() to anon, authenticated;
grant execute on function public.requesting_profile_id() to anon, authenticated;
grant execute on function public.users_are_blocked(uuid, uuid) to anon, authenticated;
grant execute on function public.get_public_profile(text) to anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to authenticated;

alter table public.profiles enable row level security;
alter table public.profile_settings enable row level security;
alter table public.clips enable row level security;
alter table public.likes enable row level security;
alter table public.comments enable row level security;
alter table public.follows enable row level security;
alter table public.bookmarks enable row level security;
alter table public.notifications enable row level security;
alter table public.reports enable row level security;
alter table public.blocks enable row level security;
alter table public.account_deletions enable row level security;
alter table public.rate_limits enable row level security;

grant usage on schema public to anon, authenticated;

grant select, insert, update on public.profiles to authenticated;
grant select, update on public.profile_settings to authenticated;
grant select on public.clips to anon;
grant select, insert, update on public.clips to authenticated;
grant select, insert, delete on public.likes to authenticated;
grant select, insert, update on public.comments to authenticated;
grant select, insert, delete on public.follows to authenticated;
grant select, insert, delete on public.bookmarks to authenticated;
grant select, update on public.notifications to authenticated;
grant select, insert on public.reports to authenticated;
grant select, insert, delete on public.blocks to authenticated;
grant select on public.account_deletions to authenticated;

create policy profiles_select_own on public.profiles
  for select to authenticated
  using ((select public.requesting_clerk_id()) = clerk_user_id);

create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check ((select public.requesting_clerk_id()) = clerk_user_id);

create policy profiles_update_own on public.profiles
  for update to authenticated
  using ((select public.requesting_clerk_id()) = clerk_user_id)
  with check ((select public.requesting_clerk_id()) = clerk_user_id);

create policy settings_select_own on public.profile_settings
  for select to authenticated
  using (profile_id = (select public.requesting_profile_id()));

create policy settings_update_own on public.profile_settings
  for update to authenticated
  using (profile_id = (select public.requesting_profile_id()))
  with check (profile_id = (select public.requesting_profile_id()));

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

create policy clips_select_own on public.clips
  for select to authenticated
  using (user_id = (select public.requesting_profile_id()));

create policy clips_insert_own on public.clips
  for insert to authenticated
  with check (user_id = (select public.requesting_profile_id()));

create policy clips_update_own on public.clips
  for update to authenticated
  using (user_id = (select public.requesting_profile_id()))
  with check (user_id = (select public.requesting_profile_id()));

create policy likes_select on public.likes
  for select to authenticated
  using (
    user_id = (select public.requesting_profile_id())
    or (
      exists (
        select 1
        from public.clips c
        join public.profiles p on p.id = likes.user_id
        join public.profile_settings s on s.profile_id = p.id
        where c.id = likes.clip_id
          and c.status = 'published'
          and c.visibility = 'public'
          and p.deleted_at is null
          and s.show_likes
      )
      and not public.users_are_blocked(likes.user_id, (select public.requesting_profile_id()))
    )
  );

create policy likes_insert_own on public.likes
  for insert to authenticated
  with check (
    user_id = (select public.requesting_profile_id())
    and exists (
      select 1 from public.clips c
      where c.id = likes.clip_id
        and not public.users_are_blocked(c.user_id, likes.user_id)
        and (
          c.user_id = likes.user_id
          or (c.status = 'published' and c.visibility = 'public')
        )
    )
  );

create policy likes_delete_own on public.likes
  for delete to authenticated
  using (user_id = (select public.requesting_profile_id()));

create policy comments_select on public.comments
  for select to authenticated
  using (
    (
      deleted_at is null
      or user_id = (select public.requesting_profile_id())
    )
    and (
      user_id = (select public.requesting_profile_id())
      or (
        exists (
          select 1
          from public.clips c
          join public.profile_settings s on s.profile_id = comments.user_id
          where c.id = comments.clip_id
            and c.status = 'published'
            and c.visibility = 'public'
            and s.show_comments
        )
        and not public.users_are_blocked(comments.user_id, (select public.requesting_profile_id()))
      )
    )
  );

create policy comments_insert_own on public.comments
  for insert to authenticated
  with check (user_id = (select public.requesting_profile_id()));

create policy comments_update_own on public.comments
  for update to authenticated
  using (user_id = (select public.requesting_profile_id()))
  with check (user_id = (select public.requesting_profile_id()));

create policy follows_select on public.follows
  for select to authenticated
  using (
    follower_id = (select public.requesting_profile_id())
    or following_id = (select public.requesting_profile_id())
    or (
      exists (
        select 1
        from public.profile_settings follower_settings
        join public.profile_settings following_settings
          on following_settings.profile_id = follows.following_id
        where follower_settings.profile_id = follows.follower_id
          and follower_settings.show_following
          and following_settings.show_followers
      )
      and not public.users_are_blocked(follows.follower_id, (select public.requesting_profile_id()))
      and not public.users_are_blocked(follows.following_id, (select public.requesting_profile_id()))
    )
  );

create policy follows_insert_own on public.follows
  for insert to authenticated
  with check (
    follower_id = (select public.requesting_profile_id())
    and follower_id <> following_id
    and not public.users_are_blocked(follower_id, following_id)
  );

create policy follows_delete_own on public.follows
  for delete to authenticated
  using (follower_id = (select public.requesting_profile_id()));

create policy bookmarks_own on public.bookmarks
  for all to authenticated
  using (user_id = (select public.requesting_profile_id()))
  with check (user_id = (select public.requesting_profile_id()));

create policy notifications_select_own on public.notifications
  for select to authenticated
  using (recipient_id = (select public.requesting_profile_id()));

create policy notifications_update_own on public.notifications
  for update to authenticated
  using (recipient_id = (select public.requesting_profile_id()))
  with check (recipient_id = (select public.requesting_profile_id()));

create policy reports_select_own on public.reports
  for select to authenticated
  using (reporter_id = (select public.requesting_profile_id()));

create policy reports_insert_own on public.reports
  for insert to authenticated
  with check (reporter_id = (select public.requesting_profile_id()));

create policy blocks_select_own on public.blocks
  for select to authenticated
  using (blocker_id = (select public.requesting_profile_id()));

create policy blocks_insert_own on public.blocks
  for insert to authenticated
  with check (
    blocker_id = (select public.requesting_profile_id())
    and blocker_id <> blocked_id
  );

create policy blocks_delete_own on public.blocks
  for delete to authenticated
  using (blocker_id = (select public.requesting_profile_id()));

create policy deletions_select_own on public.account_deletions
  for select to authenticated
  using (profile_id = (select public.requesting_profile_id()));

create table public.clip_views (
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

-- Phase 3 social actions. Run after schema.sql. Safe to re-run.

create or replace function public.clean_comment(input text)
returns text
language sql
immutable
as $$
  select nullif(btrim(regexp_replace(coalesce(input, ''), '<[^>]*>', '', 'g')), '')
$$;

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

create or replace function public.clip_interaction_allowed(target uuid, viewer uuid, for_comment boolean)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  clip public.clips;
begin
  if viewer is null then
    return false;
  end if;
  select * into clip from public.clips where id = target;
  if not found or clip.status = 'removed' or clip.status <> 'published' then
    return false;
  end if;
  if public.users_are_blocked(clip.user_id, viewer) then
    return false;
  end if;
  if clip.user_id <> viewer and not public.clip_is_visible(target, viewer, true) then
    return false;
  end if;
  if for_comment and clip.comments_mode = 'disabled' then
    return false;
  end if;
  if for_comment and clip.comments_mode = 'followers' and clip.user_id <> viewer and not exists (
    select 1 from public.follows
    where follower_id = viewer and following_id = clip.user_id
  ) then
    return false;
  end if;
  return true;
end;
$$;

create or replace function public.set_like(target uuid, should_like boolean)
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
  if not public.clip_interaction_allowed(target, viewer, false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if should_like then
    insert into public.likes (user_id, clip_id)
    values (viewer, target)
    on conflict (user_id, clip_id) do nothing;
    get diagnostics changed = row_count;
    if changed = 1 then
      perform set_config('dawnclips.allow_counter_write', 'on', true);
      update public.clips set likes_count = likes_count + 1 where id = target returning likes_count into total;
      perform public.notify_user((select user_id from public.clips where id = target), viewer, 'like', target);
    else
      select likes_count into total from public.clips where id = target;
    end if;
    return jsonb_build_object('liked', true, 'likes_count', total);
  end if;

  delete from public.likes where user_id = viewer and clip_id = target;
  get diagnostics changed = row_count;
  if changed = 1 then
    perform set_config('dawnclips.allow_counter_write', 'on', true);
    update public.clips set likes_count = greatest(likes_count - 1, 0) where id = target returning likes_count into total;
  else
    select likes_count into total from public.clips where id = target;
  end if;
  return jsonb_build_object('liked', false, 'likes_count', total);
end;
$$;

create or replace function public.set_bookmark(target uuid, should_save boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer uuid := public.requesting_profile_id();
  changed integer;
begin
  if viewer is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if not public.clip_interaction_allowed(target, viewer, false) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if should_save then
    insert into public.bookmarks (user_id, clip_id)
    values (viewer, target)
    on conflict (user_id, clip_id) do nothing;
    return jsonb_build_object('saved', true);
  end if;

  delete from public.bookmarks where user_id = viewer and clip_id = target;
  get diagnostics changed = row_count;
  return jsonb_build_object('saved', false);
end;
$$;

create or replace function public.set_follow(target uuid, should_follow boolean)
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
  if target = viewer then
    raise exception 'self follow' using errcode = '23514';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = target and deleted_at is null and deletion_status = 'active'
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if public.users_are_blocked(viewer, target) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if should_follow then
    insert into public.follows (follower_id, following_id)
    values (viewer, target)
    on conflict (follower_id, following_id) do nothing;
    get diagnostics changed = row_count;
    if changed = 1 then
      perform public.notify_user(target, viewer, 'follow', viewer);
    end if;
  else
    delete from public.follows where follower_id = viewer and following_id = target;
  end if;

  select count(*) into total from public.follows where following_id = target;
  return jsonb_build_object('following', should_follow, 'followers_count', total);
end;
$$;

create or replace function public.add_comment(target uuid, parent uuid, body text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer uuid := public.requesting_profile_id();
  clean text := public.clean_comment(body);
  created public.comments;
  owner uuid;
  parent_author uuid;
  total integer;
begin
  if viewer is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if clean is null or char_length(clean) > 500 then
    raise exception 'invalid comment' using errcode = '22023';
  end if;
  if not public.clip_interaction_allowed(target, viewer, true) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if parent is not null and not exists (
    select 1 from public.comments
    where id = parent and clip_id = target and deleted_at is null
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  insert into public.comments (user_id, clip_id, parent_id, content)
  values (viewer, target, parent, clean)
  returning * into created;

  perform set_config('dawnclips.allow_counter_write', 'on', true);
  update public.clips
  set comments_count = comments_count + 1
  where id = target
  returning user_id, comments_count into owner, total;

  if parent is null then
    perform public.notify_user(owner, viewer, 'comment', target);
  else
    select user_id into parent_author from public.comments where id = parent;
    perform public.notify_user(parent_author, viewer, 'reply', target);
    if parent_author is distinct from owner then
      perform public.notify_user(owner, viewer, 'comment', target);
    end if;
  end if;

  return jsonb_build_object(
    'id', created.id,
    'content', created.content,
    'parent_id', created.parent_id,
    'created_at', created.created_at,
    'comments_count', total
  );
end;
$$;

create or replace function public.edit_comment(target uuid, body text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer uuid := public.requesting_profile_id();
  clean text := public.clean_comment(body);
  updated public.comments;
begin
  if viewer is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if clean is null or char_length(clean) > 500 then
    raise exception 'invalid comment' using errcode = '22023';
  end if;

  update public.comments
  set content = clean
  where id = target and user_id = viewer and deleted_at is null
  returning * into updated;
  if not found then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return jsonb_build_object('id', updated.id, 'content', updated.content, 'updated_at', updated.updated_at);
end;
$$;

create or replace function public.delete_comment(target uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer uuid := public.requesting_profile_id();
  clip uuid;
  total integer;
begin
  if viewer is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  update public.comments
  set deleted_at = now(), content = '[deleted]'
  where id = target and user_id = viewer and deleted_at is null
  returning clip_id into clip;
  if not found then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  perform set_config('dawnclips.allow_counter_write', 'on', true);
  update public.clips
  set comments_count = greatest(comments_count - 1, 0)
  where id = clip
  returning comments_count into total;
  return jsonb_build_object('deleted', true, 'comments_count', total);
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
      'avatar_url', p.avatar_url
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
    select jsonb_object_agg(id, jsonb_build_object(
      'liked', exists (select 1 from public.likes where user_id = viewer and clip_id = id),
      'bookmarked', exists (select 1 from public.bookmarks where user_id = viewer and clip_id = id),
      'following', exists (
        select 1 from public.follows f
        join public.clips c on c.user_id = f.following_id
        where f.follower_id = viewer and c.id = id
      )
    ))
    from unnest(ids[1:50]) as id
  ), '{}'::jsonb);
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
    return jsonb_build_object('following', false, 'blocked', false);
  end if;
  return jsonb_build_object(
    'following', exists (
      select 1 from public.follows where follower_id = viewer and following_id = target
    ),
    'blocked', public.users_are_blocked(viewer, target)
  );
end;
$$;

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
    select jsonb_agg(jsonb_build_object(
      'id', c.id,
      'title', c.title,
      'hero_tags', c.hero_tags,
      'views_count', c.views_count,
      'likes_count', c.likes_count,
      'comments_count', c.comments_count,
      'created_at', c.created_at,
      'saved_at', b.created_at,
      'username', p.username,
      'display_name', p.display_name,
      'avatar_url', p.avatar_url
    ) order by b.created_at desc)
    from public.bookmarks b
    join public.clips c on c.id = b.clip_id
    join public.profiles p on p.id = c.user_id
    where b.user_id = viewer
      and c.status = 'published'
      and (c.user_id = viewer or public.clip_is_visible(c.id, viewer, true))
    limit lim
  ), '[]'::jsonb);
end;
$$;

create or replace function public.list_notifications(page_limit integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  viewer uuid := public.requesting_profile_id();
  lim integer := least(greatest(coalesce(page_limit, 30), 1), 50);
begin
  if viewer is null then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', n.id,
      'type', n.type,
      'reference_id', n.reference_id,
      'is_read', n.is_read,
      'created_at', n.created_at,
      'actor_id', p.id,
      'username', p.username,
      'display_name', p.display_name,
      'avatar_url', p.avatar_url
    ) order by n.created_at desc)
    from (
      select * from public.notifications
      where recipient_id = viewer
      order by created_at desc
      limit lim
    ) n
    left join public.profiles p on p.id = n.actor_id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.unread_notification_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.notifications
  where recipient_id = public.requesting_profile_id()
    and is_read = false
$$;

create or replace function public.mark_notification_read(target uuid)
returns void
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
  update public.notifications
  set is_read = true
  where id = target and recipient_id = viewer;
end;
$$;

create or replace function public.mark_all_notifications_read()
returns void
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
  update public.notifications
  set is_read = true
  where recipient_id = viewer and is_read = false;
end;
$$;

revoke all on function public.clean_comment(text) from public;
revoke all on function public.notify_user(uuid, uuid, text, uuid) from public;
revoke all on function public.clip_interaction_allowed(uuid, uuid, boolean) from public;
revoke all on function public.set_like(uuid, boolean) from public;
revoke all on function public.set_bookmark(uuid, boolean) from public;
revoke all on function public.set_follow(uuid, boolean) from public;
revoke all on function public.add_comment(uuid, uuid, text) from public;
revoke all on function public.edit_comment(uuid, text) from public;
revoke all on function public.delete_comment(uuid) from public;
revoke all on function public.list_comments(uuid) from public;
revoke all on function public.viewer_clip_flags(uuid[]) from public;
revoke all on function public.profile_relationship(uuid) from public;
revoke all on function public.list_saved_clips(integer) from public;
revoke all on function public.list_notifications(integer) from public;
revoke all on function public.unread_notification_count() from public;
revoke all on function public.mark_notification_read(uuid) from public;
revoke all on function public.mark_all_notifications_read() from public;

grant execute on function public.set_like(uuid, boolean) to authenticated;
grant execute on function public.set_bookmark(uuid, boolean) to authenticated;
grant execute on function public.set_follow(uuid, boolean) to authenticated;
grant execute on function public.add_comment(uuid, uuid, text) to authenticated;
grant execute on function public.edit_comment(uuid, text) to authenticated;
grant execute on function public.delete_comment(uuid) to authenticated;
grant execute on function public.list_comments(uuid) to anon, authenticated;
grant execute on function public.viewer_clip_flags(uuid[]) to authenticated;
grant execute on function public.profile_relationship(uuid) to anon, authenticated;
grant execute on function public.list_saved_clips(integer) to authenticated;
grant execute on function public.list_notifications(integer) to authenticated;
grant execute on function public.unread_notification_count() to authenticated;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;

revoke insert, update, delete on public.likes from anon, authenticated;
revoke insert, update, delete on public.comments from anon, authenticated;
revoke insert, update, delete on public.follows from anon, authenticated;
revoke insert, update, delete on public.bookmarks from anon, authenticated;
revoke insert, delete on public.notifications from anon, authenticated;

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

-- Phase 5. Run after schema-phase4.sql.

create or replace function public.requesting_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.profiles
  where clerk_user_id = public.requesting_clerk_id()
    and deletion_status = 'active'
  limit 1
$$;

create unique index if not exists account_deletions_profile_id_key on public.account_deletions (profile_id);

create or replace function public.public_index()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'clips', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'updated_at', c.updated_at))
      from (
        select c.id, c.updated_at
        from public.clips c
        join public.profiles p on p.id = c.user_id
        join public.profile_settings s on s.profile_id = p.id
        where c.status = 'published'
          and c.visibility = 'public'
          and p.deleted_at is null
          and p.deletion_status = 'active'
          and s.show_highlights
        order by c.updated_at desc
        limit 5000
      ) c
    ), '[]'::jsonb),
    'profiles', coalesce((
      select jsonb_agg(jsonb_build_object('username', p.username, 'updated_at', p.updated_at))
      from (
        select username, updated_at
        from public.profiles
        where deleted_at is null and deletion_status = 'active'
        order by updated_at desc
        limit 5000
      ) p
    ), '[]'::jsonb)
  )
$$;

revoke all on function public.public_index() from public;
grant execute on function public.public_index() to anon, authenticated;

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

-- DawnClips Phase 9: let the server (service_role) read and write the tables it uses directly.
-- The app's server routes (delete clip, moderation queue, account deletion) use the service-role key
-- with table queries such as admin.from("clips"). Earlier phases granted table access only to anon and
-- authenticated and granted service_role access to functions only. On projects where the Data API does
-- not grant privileges to new tables automatically, those queries fail with "permission denied for table",
-- which the delete route used to report as "Clip not found".
-- service_role bypasses RLS, so this does not widen what anon or authenticated users can do.
-- Safe to run more than once.

grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Tables created later by the same role get the same access.
alter default privileges in schema public grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;
