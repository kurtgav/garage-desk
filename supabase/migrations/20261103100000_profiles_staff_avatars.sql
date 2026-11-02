-- Phase 5 (PLAN "Phase 5", D-076…D-078): own profile fields, owner-only (de)activation, private avatars bucket.

-- ---------------------------------------------------------------------------
-- 1. Profile fields. Staff edit their own row, these columns only; role/active stay server-side.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column phone text check (char_length(phone) <= 30),
  add column about text check (char_length(about) <= 500),
  add column avatar_path text,
  add column updated_at timestamptz not null default now(),
  add constraint profiles_full_name_length check (char_length(full_name) <= 100),
  -- A photo path can only point into the row owner's own folder (no borrowing a colleague's file).
  add constraint profiles_avatar_path_own_folder check (
    avatar_path is null or avatar_path ~ ('^' || id::text || '/[A-Za-z0-9_-]{8,64}\.(png|jpg|webp)$')
  );

create function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at before update on public.profiles
  for each row execute function private.touch_updated_at();

-- D-076: colleagues read name, role and photo (timelines, pickers, avatars) but never phone/about.
-- The signed-in user's own phone/about are read on the server for that user only (src/lib/data/profile.ts).
revoke select on public.profiles from authenticated;
grant select (id, full_name, role, active, avatar_path, updated_at) on public.profiles to authenticated;
grant update (full_name, phone, about, avatar_path) on public.profiles to authenticated;

create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid()) and (select private.is_staff()))
  with check (id = (select auth.uid()) and (select private.is_staff()));

-- ---------------------------------------------------------------------------
-- 2. Owner-only activation (D-077). The caller must be an active owner and never the target. The
--    advisory lock (taken only by owners) serialises calls, so the last_owner check sees a concurrent
--    deactivation: two owners cannot deactivate each other at the same moment. Deactivation ends every
--    session (refresh tokens cascade), so a later reactivation does not revive old sign-ins.
-- ---------------------------------------------------------------------------

create function public.set_staff_active(p_profile_id uuid, p_active boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (select private.is_owner()) then
    raise exception 'forbidden';
  end if;
  if p_profile_id = (select auth.uid()) then
    raise exception 'cannot_change_self';
  end if;
  perform pg_advisory_xact_lock(hashtext('public.set_staff_active'));
  update public.profiles set active = p_active where id = p_profile_id;
  if not found then
    raise exception 'not_found';
  end if;
  if not exists (select 1 from public.profiles p where p.role = 'owner' and p.active) then
    raise exception 'last_owner';
  end if;
  if not p_active then
    delete from auth.sessions where user_id = p_profile_id;
  end if;
end;
$$;

revoke all on function public.set_staff_active(uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_staff_active(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Avatars (D-078): private bucket, 2 MB, raster images only (no SVG). Path {user_id}/{random}.{ext}.
--    Active staff read every photo (through short-lived signed URLs); writes only in the own folder.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy avatars_select on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (select private.is_staff()));

create policy avatars_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars' and (select private.is_staff())
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy avatars_update on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars' and (select private.is_staff())
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars' and (select private.is_staff())
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy avatars_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars' and (select private.is_staff())
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
