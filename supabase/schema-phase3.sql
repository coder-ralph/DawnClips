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
