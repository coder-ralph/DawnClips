-- DawnClips Phase 15: photo posts and photo attachments on comments.
--
-- Photo posts are stored in the SAME table as video clips (public.clips) with a new `kind` column ('video' by default,
-- or 'photo'). Likes, comments, bookmarks, notifications, reports, visibility, blocks, mutes, the feed ranking and the
-- viewer all already hang off clips.id, so a second posts table would mean duplicating or forking every one of them.
-- Existing rows become kind = 'video' and nothing else about them changes.
--
-- New tables (no direct access for signed-in users; the server writes with the service role and reads through the
-- SECURITY DEFINER functions below):
--   post_media     the images of a photo post: up to 20, ordered by `position` (0..19, unique per post), with the
--                  declared type, size and pixel size. The R2 key is never stored: it is derived from the owner, the post
--                  and the image id (posts/<owner>/<post>/<image>.<jpg|png|webp>), the same rule as Phase 10 for clips.
--   comment_media  one image per comment (<= 5 MB). A row starts 'pending' when the upload URL is issued, becomes
--                  'verified' when the server has read the uploaded bytes, and 'attached' when add_comment_with_media
--                  links it to the new comment (comment-images/<owner>/<image>.<jpg|png|webp>). Deleting a comment deletes
--                  this row too (on delete cascade); the server deletes the R2 object first (comment_tree_ids lists the
--                  comment and its replies, because delete_comment removes the whole thread).
--
-- Other changes:
--   clips.kind                  guarded: only the server can change it (guard_clip_kind). A photo post has no video key.
--   clips.title                 may be empty for a photo post (the caption is optional); videos still need 1..120.
--   comments.content            may be empty only when the comment has an image (deferred constraint trigger).
--   profile_settings.show_posts new privacy switch for the Posts tab (default on). Photo posts follow show_posts; videos
--                               keep following show_highlights.
--   Replaced, each = the current definition plus the condition described:
--     clip_is_visible, explore_search, public_index, search_explore   kind-aware privacy switch
--     list_feed                   kind-aware switch, kind/cover in the rows, and the page cursor now continues after the
--                                 last clip RETURNED (it used the extra look-ahead row, which skipped one clip per page)
--     related_clips, trending_sidebar, profile_activity               video only
--     authorize_clip_playback     photo posts are authorised too, and the media list is returned
--     clip_row_json               kind, media_count, cover
--     profile_clips               new 'posts' tab; 'highlights' is video only
--     get_public_profile          show_posts, posts_count; clips_count counts videos
--     set_clip_pinned             only videos can be pinned
--     list_comments               returns each comment's image
--   New: add_comment_with_media, comment_tree_ids (service role only).
--
-- Run it in the Supabase SQL editor BEFORE deploying the code that uses it, after schema-phase14.sql. Safe to run more
-- than once. No existing row is changed or deleted. R2 needs no change: the bucket stays private and the new prefixes
-- (posts/, comment-images/) live beside clips/.

-- ---------------------------------------------------------------------------
-- 1. clips.kind
-- ---------------------------------------------------------------------------

alter table public.clips add column if not exists kind text not null default 'video';

alter table public.clips drop constraint if exists clips_kind_valid;
alter table public.clips add constraint clips_kind_valid check (kind in ('video', 'photo'));

-- A photo post has no video or poster object of its own.
alter table public.clips drop constraint if exists clips_kind_storage;
alter table public.clips add constraint clips_kind_storage
  check (kind = 'video' or (r2_object_key is null and thumbnail_object_key is null and video_url is null));

-- The caption of a photo post is optional, so its title (the first line) may be empty. Videos still need 1..120.
alter table public.clips drop constraint if exists clips_title_len;
alter table public.clips add constraint clips_title_len
  check (char_length(title) <= 120 and (kind = 'photo' or char_length(title) >= 1));

create index if not exists clips_owner_kind_idx on public.clips (user_id, kind, created_at desc) where status = 'published';

create or replace function public.guard_clip_kind()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.kind is distinct from old.kind
     and current_user not in ('service_role', 'postgres', 'supabase_admin') then
    raise exception 'clip kind is managed by the server' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_clip_kind on public.clips;
create trigger guard_clip_kind
  before update on public.clips
  for each row execute function public.guard_clip_kind();

alter table public.profile_settings add column if not exists show_posts boolean not null default true;

-- ---------------------------------------------------------------------------
-- 2. post_media: up to 20 ordered images per photo post
-- ---------------------------------------------------------------------------

create table if not exists public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.clips (id) on delete cascade,
  position smallint not null,
  mime_type text not null,
  file_size bigint not null,
  width integer not null,
  height integer not null,
  created_at timestamptz not null default now(),
  constraint post_media_position_range check (position between 0 and 19),
  constraint post_media_mime_valid check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  constraint post_media_size_valid check (file_size > 0 and file_size <= 104857600),
  constraint post_media_dimensions_valid check (width between 1 and 16384 and height between 1 and 16384),
  constraint post_media_unique_position unique (post_id, position)
);

alter table public.post_media enable row level security;
revoke all on public.post_media from anon, authenticated;
grant select, insert, update, delete on public.post_media to service_role;

-- ---------------------------------------------------------------------------
-- 3. comment_media: one image per comment
-- ---------------------------------------------------------------------------

create table if not exists public.comment_media (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  comment_id uuid unique references public.comments (id) on delete cascade,
  status text not null default 'pending',
  mime_type text not null,
  file_size bigint not null,
  width integer not null,
  height integer not null,
  created_at timestamptz not null default now(),
  constraint comment_media_status_valid check (status in ('pending', 'verified', 'attached')),
  constraint comment_media_attached_link check ((status = 'attached') = (comment_id is not null)),
  constraint comment_media_mime_valid check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  constraint comment_media_size_valid check (file_size > 0 and file_size <= 5242880),
  constraint comment_media_dimensions_valid check (width between 1 and 16384 and height between 1 and 16384)
);

create index if not exists comment_media_unattached_idx on public.comment_media (owner_id, created_at) where status <> 'attached';

alter table public.comment_media enable row level security;
revoke all on public.comment_media from anon, authenticated;
grant select, insert, update, delete on public.comment_media to service_role;

-- A comment may have no text only when it carries an image. Checked at commit, because the image is linked right after
-- the comment is inserted (add_comment_with_media).
alter table public.comments drop constraint if exists comments_content_len;
alter table public.comments add constraint comments_content_len check (char_length(content) <= 500);

create or replace function public.check_comment_content()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if char_length(new.content) = 0
     and not exists (select 1 from public.comment_media m where m.comment_id = new.id) then
    raise exception 'comment cannot be empty' using errcode = '23514';
  end if;
  return null;
end;
$$;

drop trigger if exists comments_content_required on public.comments;
create constraint trigger comments_content_required
  after insert or update of content on public.comments
  deferrable initially deferred
  for each row execute function public.check_comment_content();

-- ---------------------------------------------------------------------------
-- 4. Helpers (internal: no grants for signed-in users)
-- ---------------------------------------------------------------------------

create or replace function public.clip_media_count(clip uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer from public.post_media where post_id = clip
$$;

create or replace function public.clip_cover_json(clip uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('id', m.id, 'width', m.width, 'height', m.height, 'mime_type', m.mime_type)
  from public.post_media m
  where m.post_id = clip
  order by m.position
  limit 1
$$;

create or replace function public.clip_media_json(clip uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object('id', m.id, 'position', m.position, 'width', m.width, 'height', m.height, 'mime_type', m.mime_type)
    order by m.position
  ), '[]'::jsonb)
  from public.post_media m
  where m.post_id = clip
$$;

-- The comment and every reply beneath it: delete_comment removes them all, so the server needs their ids first to delete
-- the images attached to them from R2. Service role only (the route has already checked that the caller wrote `target`).
create or replace function public.comment_tree_ids(target uuid)
returns uuid[]
language sql
stable
security definer
set search_path = public
as $$
  with recursive tree as (
    select id from public.comments where id = target
    union
    select c.id from public.comments c join tree t on c.parent_id = t.id
  )
  select coalesce(array_agg(id), '{}'::uuid[]) from tree;
$$;

-- ---------------------------------------------------------------------------
-- 5. Comment with an image
-- ---------------------------------------------------------------------------

create or replace function public.add_comment_with_media(target uuid, parent uuid, body text, media uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  viewer uuid := public.requesting_profile_id();
  clean text := public.clean_comment(body);
  created public.comments;
  image public.comment_media;
  owner uuid;
  parent_author uuid;
  total integer;
begin
  if viewer is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  if media is null or char_length(coalesce(clean, '')) > 500 then
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

  -- Only the person who uploaded the image can attach it, once, and only after the server verified the bytes.
  select * into image
  from public.comment_media
  where id = media and owner_id = viewer and status = 'verified' and comment_id is null
  for update;
  if not found then
    raise exception 'invalid media' using errcode = '22023';
  end if;

  insert into public.comments (user_id, clip_id, parent_id, content)
  values (viewer, target, parent, coalesce(clean, ''))
  returning * into created;

  update public.comment_media set comment_id = created.id, status = 'attached' where id = image.id;

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
    'comments_count', total,
    'user_id', viewer,
    'media', jsonb_build_object('id', image.id, 'width', image.width, 'height', image.height, 'mime_type', image.mime_type)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Replaced functions (current definition plus the one change listed in the header)
-- ---------------------------------------------------------------------------

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
          (case when c.kind = 'photo' then s.show_posts else s.show_highlights end)
          and (
            c.visibility = 'public'
            or (allow_unlisted and c.visibility = 'unlisted')
          )
          and (viewer is null or not public.users_are_blocked(c.user_id, viewer))
        )
      )
  )
$$;

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
    'kind', c.kind,
    'media_count', case when c.kind = 'photo' then public.clip_media_count(c.id) else 0 end,
    'cover', case when c.kind = 'photo' then public.clip_cover_json(c.id) else null end,
    'visibility', c.visibility,
    'comments_mode', c.comments_mode,
    'user_id', c.user_id,
    'username', p.username,
    'display_name', p.display_name,
    'avatar_url', p.avatar_url
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
security definer
set search_path = public
as $$
declare
  viewer uuid := public.requesting_profile_id();
  lim integer := least(greatest(coalesce(page_limit, 8), 1), 20);
  items jsonb := '[]'::jsonb;
  next_cursor jsonb := null;
  seen integer := 0;
  last_at timestamptz;
  last_id uuid;
  last_score numeric;
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
        c.kind,
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
          where s.profile_id = c.user_id and (case when c.kind = 'photo' then s.show_posts else s.show_highlights end)
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
        'kind', rec.kind,
        'media_count', case when rec.kind = 'photo' then public.clip_media_count(rec.id) else 0 end,
        'cover', case when rec.kind = 'photo' then public.clip_cover_json(rec.id) else null end,
        'username', rec.username,
        'display_name', rec.display_name,
        'avatar_url', rec.avatar_url,
        'score', rec.score
      ));
      last_at := rec.created_at;
      last_id := rec.id;
      last_score := rec.score;
    elsif next_cursor is null then
      -- The page is full and at least one more clip exists: the next page starts after the last clip that was returned.
      next_cursor := jsonb_build_object(
        'created_at', last_at,
        'id', last_id,
        'score', last_score
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
      and c.kind = 'video'
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
      and c.kind = 'video'
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
      and c.kind = 'video'
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
  if not found or (found_clip.r2_object_key is null and found_clip.kind = 'video') or found_clip.status = 'removed' then
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
      'kind', found_clip.kind,
      'media', case when found_clip.kind = 'photo' then public.clip_media_json(found_clip.id) else '[]'::jsonb end,
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
  if tab not in ('highlights', 'posts', 'liked') then
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
  if tab = 'posts' and not owner and not coalesce(settings.show_posts, true) then
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
          and c.kind = 'video'
          and c.status = 'published'
          and (owner or (c.visibility = 'public' and (viewer is null or not public.users_are_blocked(viewer, c.user_id))))
        order by (c.pinned_at is not null) desc, c.created_at desc
        limit lim
      ) r
      join public.clips c on c.id = r.id
      join public.profiles p on p.id = c.user_id
    ), '[]'::jsonb);
  end if;

  if tab = 'posts' then
    return coalesce((
      select jsonb_agg(public.clip_row_json(c, p) order by r.ord)
      from (
        select c.id, row_number() over (order by c.created_at desc) as ord
        from public.clips c
        where c.user_id = target
          and c.kind = 'photo'
          and c.status = 'published'
          and (owner or (c.visibility = 'public' and (viewer is null or not public.users_are_blocked(viewer, c.user_id))))
        order by c.created_at desc
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
      and (case when c.kind = 'photo' then s.show_posts else s.show_highlights end)
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
          and (case when c.kind = 'photo' then s.show_posts else s.show_highlights end)
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
          and (case when c.kind = 'photo' then s.show_posts else s.show_highlights end)
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
        and (case when c.kind = 'photo' then s.show_posts else s.show_highlights end)
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
          and c.kind = 'video'
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
  posts_visible boolean;
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
  posts_visible := is_owner or coalesce(settings.show_posts, true);

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
    'show_posts', posts_visible,
    'show_comments', is_owner or coalesce(settings.show_comments, true),
    'show_likes', is_owner or coalesce(settings.show_likes, true),
    'clips_count', case when highlights_visible then (
      select count(*) from public.clips c
      where c.user_id = row.id and c.kind = 'video' and c.status = 'published' and c.visibility = 'public'
    ) else null end,
    'posts_count', case when posts_visible then (
      select count(*) from public.clips c
      where c.user_id = row.id and c.kind = 'photo' and c.status = 'published' and c.visibility = 'public'
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
  if not found or clip.status <> 'published' or clip.kind <> 'video' then
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
      ),
      'media', (
        select jsonb_build_object('id', m.id, 'width', m.width, 'height', m.height, 'mime_type', m.mime_type)
        from public.comment_media m
        where m.comment_id = c.id and m.status = 'attached'
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

revoke all on function public.clip_media_count(uuid) from public;
revoke all on function public.clip_cover_json(uuid) from public;
revoke all on function public.clip_media_json(uuid) from public;
revoke all on function public.add_comment_with_media(uuid, uuid, text, uuid) from public;
revoke all on function public.comment_tree_ids(uuid) from public;
revoke all on function public.guard_clip_kind() from public;
revoke all on function public.check_comment_content() from public;
grant execute on function public.add_comment_with_media(uuid, uuid, text, uuid) to authenticated;
grant execute on function public.comment_tree_ids(uuid) to service_role;
