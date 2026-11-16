-- DawnClips Phase 10: protect clip storage columns from direct writes (R2 storage security patch).
--
-- Why: signed-in users hold a database role (authenticated) with table-level insert and update on public.clips, and
-- the row policies only check ownership of the row. Nothing stopped an owner from writing r2_object_key,
-- thumbnail_object_key, thumbnail_url, file_size, mime_type, user_id or status themselves through the Data API. A
-- hand-edited thumbnail_object_key could point at another user's object, which the server would then sign for
-- playback or delete together with the clip, and a hand-edited status skipped the upload checks.
--
-- What this does:
--   1. Signed-in users can no longer insert clips. The upload routes now insert and update clip rows with the
--      service role (scoped to the verified owner), so the normal upload flow is unchanged.
--   2. guard_clip_storage() runs before every insert and update on public.clips:
--        - For every role, a storage key that is being written must be the key derived from the clip's own owner and
--          id: clips/<user_id>/<id>.mp4 for the video and clips/<user_id>/<id>.jpg for the poster.
--        - For signed-in users (anything but service_role, postgres and supabase_admin), user_id, r2_object_key,
--          thumbnail_object_key, thumbnail_url, file_size, mime_type and status cannot change, and an insert must
--          be a pending clip with no thumbnail_url.
--      Title, description, tags, comments_mode, visibility and the existing edit window are unchanged.
--      Security-definer functions (edit_clip, set_clip_pinned, ...) run as the table owner and are exempt.
--   3. Existing rows are never rewritten. The key rule only applies to a key that is being written, so a legacy row
--      whose keys differ from the derived ones keeps working until its keys are touched. The notice below reports them.
--
-- Run it in the Supabase SQL editor after schema-phase9.sql. Safe to run more than once. Nothing here changes
-- Row Level Security policies, Cloudflare R2 or any environment variable.
--
-- Optional pre-flight (read-only), expect zero rows. Any row listed has stored keys that are not the derived ones:
--   select id, user_id, r2_object_key, thumbnail_object_key
--   from public.clips c
--   where (c.r2_object_key is not null and c.r2_object_key <> 'clips/' || c.user_id || '/' || c.id || '.mp4')
--      or (c.thumbnail_object_key is not null and c.thumbnail_object_key <> 'clips/' || c.user_id || '/' || c.id || '.jpg');

create or replace function public.guard_clip_storage()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  privileged boolean := current_user in ('service_role', 'postgres', 'supabase_admin');
  expected_video text := 'clips/' || new.user_id::text || '/' || new.id::text || '.mp4';
  expected_poster text := 'clips/' || new.user_id::text || '/' || new.id::text || '.jpg';
begin
  if tg_op = 'INSERT' then
    if new.r2_object_key is not null and new.r2_object_key <> expected_video then
      raise exception 'invalid clip storage key' using errcode = '42501';
    end if;
    if new.thumbnail_object_key is not null and new.thumbnail_object_key <> expected_poster then
      raise exception 'invalid clip storage key' using errcode = '42501';
    end if;
    if not privileged and (new.status is distinct from 'pending' or new.thumbnail_url is not null) then
      raise exception 'clip storage fields are managed by the server' using errcode = '42501';
    end if;
    return new;
  end if;

  -- A key may only change to the clip's own derived key (or be cleared), whoever writes it.
  if new.r2_object_key is distinct from old.r2_object_key
     and new.r2_object_key is not null and new.r2_object_key <> expected_video then
    raise exception 'invalid clip storage key' using errcode = '42501';
  end if;
  if new.thumbnail_object_key is distinct from old.thumbnail_object_key
     and new.thumbnail_object_key is not null and new.thumbnail_object_key <> expected_poster then
    raise exception 'invalid clip storage key' using errcode = '42501';
  end if;

  if not privileged and (
    new.user_id is distinct from old.user_id
    or new.r2_object_key is distinct from old.r2_object_key
    or new.thumbnail_object_key is distinct from old.thumbnail_object_key
    or new.thumbnail_url is distinct from old.thumbnail_url
    or new.file_size is distinct from old.file_size
    or new.mime_type is distinct from old.mime_type
    or new.status is distinct from old.status
  ) then
    raise exception 'clip storage fields are managed by the server' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_clip_storage on public.clips;
create trigger guard_clip_storage
  before insert or update on public.clips
  for each row execute function public.guard_clip_storage();

-- Clips are created by the upload route with the service role (service_role keeps its table access from Phase 9).
revoke insert on public.clips from authenticated;

-- Report existing rows whose stored keys are not the derived ones. They are left as they are.
do $$
declare
  mismatched integer;
begin
  select count(*) into mismatched
  from public.clips c
  where (c.r2_object_key is not null and c.r2_object_key <> 'clips/' || c.user_id || '/' || c.id || '.mp4')
     or (c.thumbnail_object_key is not null and c.thumbnail_object_key <> 'clips/' || c.user_id || '/' || c.id || '.jpg');
  if mismatched > 0 then
    raise warning 'DawnClips Phase 10: % clip row(s) store an object key that is not the derived key for their owner and id. The app will not play or delete those objects. Review them with the pre-flight query at the top of this file.', mismatched;
  else
    raise notice 'DawnClips Phase 10: every stored clip object key matches its owner and id.';
  end if;
end;
$$;
