-- Bobo Golf Trip — premium UI migration
-- Adds per-trip handicaps, a public-leaderboard flag, Realtime on scoring
-- tables, and read-only anon access for the signed-out leaderboard preview.
-- Run this in Supabase: SQL Editor -> paste -> Run (after 0001_init.sql).

-- 1. Per-trip handicap. Net score = gross - handicap per round played.
alter table public.trip_members
  add column if not exists handicap numeric(4,1);

-- 2. Public-leaderboard flag. When true, the trip's leaderboard is visible
--    to signed-out visitors (names + scores only). Organizers can turn it off.
alter table public.trips
  add column if not exists is_public boolean not null default true;

-- 3. Enable Supabase Realtime on the tables the live leaderboard depends on.
do $$
declare t text;
begin
  foreach t in array array['scores','trip_members','rounds'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I;', t);
    exception
      when duplicate_object then null;  -- already in the publication
      when undefined_object then null;  -- publication not present on this project
    end;
  end loop;
end $$;

-- 4. Read-only anon access for the public leaderboard preview.
--    Writes stay fully gated by the existing authenticated policies.

-- Profiles: anon may read display names (no emails live here).
drop policy if exists "profiles public read" on public.profiles;
create policy "profiles public read"
  on public.profiles for select to anon using (true);

-- Trips: anon may read trips explicitly flagged public.
drop policy if exists "trips public read" on public.trips;
create policy "trips public read"
  on public.trips for select to anon using (is_public);

-- Trip members: anon may read the roster of a public trip.
drop policy if exists "members public read" on public.trip_members;
create policy "members public read"
  on public.trip_members for select to anon
  using (exists (
    select 1 from public.trips t where t.id = trip_id and t.is_public
  ));

-- Rounds: anon may read rounds of a public trip.
drop policy if exists "rounds public read" on public.rounds;
create policy "rounds public read"
  on public.rounds for select to anon
  using (exists (
    select 1 from public.trips t where t.id = trip_id and t.is_public
  ));

-- Scores: anon may read scores belonging to a public trip's rounds.
drop policy if exists "scores public read" on public.scores;
create policy "scores public read"
  on public.scores for select to anon
  using (exists (
    select 1
    from public.rounds r
    join public.trips t on t.id = r.trip_id
    where r.id = round_id and t.is_public
  ));
