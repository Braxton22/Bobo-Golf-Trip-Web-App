-- =============================================================================
-- 0004_photos_storage.sql — Storage bucket + RLS for the per-trip photo gallery.
--
-- Photos are stored under `${trip_id}/${random}-${filename}`. RLS policies
-- check the leading path segment against the user's trip membership.
-- =============================================================================

-- Create (or upsert) the private bucket. We keep it private so signed URLs are
-- needed to display photos — RLS on storage.objects controls who can list it.
insert into storage.buckets (id, name, public, file_size_limit)
values ('trip-photos', 'trip-photos', false, 10485760)  -- 10 MB
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

-- Cleanup any prior policies so this is idempotent.
drop policy if exists "trip_photos_select" on storage.objects;
drop policy if exists "trip_photos_insert" on storage.objects;
drop policy if exists "trip_photos_delete" on storage.objects;

create policy "trip_photos_select" on storage.objects
  for select using (
    bucket_id = 'trip-photos'
    and public.is_trip_member((storage.foldername(name))[1]::uuid)
  );

create policy "trip_photos_insert" on storage.objects
  for insert with check (
    bucket_id = 'trip-photos'
    and public.is_trip_member((storage.foldername(name))[1]::uuid)
    and auth.uid() is not null
  );

create policy "trip_photos_delete" on storage.objects
  for delete using (
    bucket_id = 'trip-photos'
    and (
      owner = auth.uid()
      or public.is_trip_admin((storage.foldername(name))[1]::uuid)
    )
  );
