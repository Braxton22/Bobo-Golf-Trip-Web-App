-- =============================================================================
-- 0008_app_admin.sql
--
-- Restrict trip creation to the app-admin allowlist at the DATABASE level.
-- The UI hides /admin from non-admins, but RLS is the real gate: without
-- this, any signed-in user could insert a trip via the REST API and become
-- its trip-admin.
--
-- The allowlist lives in this function. To add an admin later, update the
-- list here (new migration) — or promote them per-trip via trip_admins,
-- which doesn't require app-admin at all.
-- =============================================================================

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'braxton.bobo@gmail.com'
  );
$$;

-- Default privileges were revoked from PUBLIC in 0006, so grant explicitly:
-- RLS policies evaluate this as the calling user.
revoke execute on function public.is_app_admin() from public;
grant execute on function public.is_app_admin() to authenticated;

-- Only the app admin can create trips. created_by must still be the caller.
drop policy if exists trips_insert on public.trips;
create policy trips_insert on public.trips
  for insert with check (created_by = auth.uid() and public.is_app_admin());

-- Deleting a trip is likewise app-admin only (was: any creator).
drop policy if exists trips_delete on public.trips;
create policy trips_delete on public.trips
  for delete using (created_by = auth.uid() and public.is_app_admin());
