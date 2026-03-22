-- 2026-03-22: avatar de perfil do usuario + bucket dedicado

alter table public.users
  add column if not exists avatar_url text;

insert into storage.buckets (id, name, public)
select 'profile-avatars', 'profile-avatars', true
where not exists (
  select 1 from storage.buckets where id = 'profile-avatars'
);

drop policy if exists "profile_avatars_storage_read" on storage.objects;
create policy "profile_avatars_storage_read" on storage.objects
  for select using (
    bucket_id = 'profile-avatars'
  );

drop policy if exists "profile_avatars_storage_insert" on storage.objects;
create policy "profile_avatars_storage_insert" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'profile-avatars'
    and auth.uid() = owner
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "profile_avatars_storage_update" on storage.objects;
create policy "profile_avatars_storage_update" on storage.objects
  for update to authenticated using (
    bucket_id = 'profile-avatars'
    and auth.uid() = owner
    and split_part(name, '/', 1) = auth.uid()::text
  )
  with check (
    bucket_id = 'profile-avatars'
    and auth.uid() = owner
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "profile_avatars_storage_delete" on storage.objects;
create policy "profile_avatars_storage_delete" on storage.objects
  for delete to authenticated using (
    bucket_id = 'profile-avatars'
    and auth.uid() = owner
    and split_part(name, '/', 1) = auth.uid()::text
  );
