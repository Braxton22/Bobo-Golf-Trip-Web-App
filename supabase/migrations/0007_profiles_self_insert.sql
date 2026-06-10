-- =============================================================================
-- 0007_profiles_self_insert.sql
--
-- Allow a signed-in user to create their OWN profiles row. Normally the
-- on-signup trigger creates it, but users whose profile predates a DB reset
-- (auth.users survives, public.profiles doesn't) end up with no row — and
-- trips/players/photos all FK to profiles(id), so their writes fail.
-- The app's ensureProfile() helper self-heals this; the policy lets it.
-- =============================================================================

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles
  for insert with check (id = auth.uid());
