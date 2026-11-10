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
