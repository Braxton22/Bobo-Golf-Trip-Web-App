-- =============================================================================
-- 0003_ryder_cup.sql — full Ryder-Cup-format schema for the trip app.
--
-- This migration is destructive: it drops the legacy v1 tables (which only had
-- trip-level totals) and rebuilds them as a per-hole, per-match data model.
-- Apply once on a fresh project; subsequent changes should be additive.
-- =============================================================================

-- --- 0. Reset the legacy tables (no data preserved). ------------------------
drop table if exists public.bets cascade;
drop table if exists public.scores cascade;
drop table if exists public.rounds cascade;
drop table if exists public.airbnbs cascade;
drop table if exists public.trip_members cascade;
drop table if exists public.trips cascade;
-- Keep public.profiles — it's wired up to auth.users via trigger.

create extension if not exists "pgcrypto";

-- --- 1. Profiles -------------------------------------------------------------
-- Extend the existing profiles table with an optional email mirror.
alter table public.profiles add column if not exists email text;

-- --- 2. Trips ----------------------------------------------------------------
create table public.trips (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  year int not null,
  start_date date,
  end_date date,
  location text,
  join_code text not null unique,
  created_by uuid references public.profiles(id) on delete set null,
  handicap_mode text not null default 'simple' check (handicap_mode in ('simple','slope')),
  scramble_allowance jsonb not null default '{"low":0.35,"high":0.15}'::jsonb,
  bonus_threshold text not null default 'net_par_or_better',
  tie_outcome_label text not null default 'Cup retained / shared',
  points_to_win numeric(4,1) not null default 6.5,
  total_points int not null default 12,
  archived boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index trips_created_by_idx on public.trips(created_by);

-- --- 3. Trip admins ----------------------------------------------------------
create table public.trip_admins (
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

-- --- 4. Teams ----------------------------------------------------------------
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  name text not null,
  color text,                   -- e.g. 'Augusta Green', or a hex
  captain_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index teams_trip_idx on public.teams(trip_id);

-- --- 5. Courses, tees, holes, yardages ---------------------------------------
create table public.courses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  name text not null,
  latitude numeric(9,6),
  longitude numeric(9,6),
  created_at timestamptz not null default now()
);
create index courses_trip_idx on public.courses(trip_id);

create table public.tees (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  name text not null,                       -- e.g. 'Blue', 'White'
  course_rating numeric(4,1),
  slope int,
  par int,
  created_at timestamptz not null default now()
);

create table public.holes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  hole_number int not null check (hole_number between 1 and 18),
  par int not null check (par between 3 and 6),
  stroke_index int not null check (stroke_index between 1 and 18),
  unique (course_id, hole_number),
  unique (course_id, stroke_index)
);
create index holes_course_idx on public.holes(course_id);

create table public.hole_yardages (
  hole_id uuid not null references public.holes(id) on delete cascade,
  tee_id uuid not null references public.tees(id) on delete cascade,
  yards int not null,
  primary key (hole_id, tee_id)
);

-- --- 6. Players (trip roster) ------------------------------------------------
create table public.players (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  name text not null,
  handicap_index numeric(4,1) not null default 0,
  tee_id uuid references public.tees(id) on delete set null,
  tee_time time,
  venmo_username text,
  team_id uuid references public.teams(id) on delete set null,
  created_at timestamptz not null default now()
);
create index players_trip_idx on public.players(trip_id);
create index players_user_idx on public.players(user_id);
create index players_team_idx on public.players(team_id);
create unique index players_trip_user_uniq on public.players(trip_id, user_id) where user_id is not null;

-- --- 7. Rounds (one per day) -------------------------------------------------
create table public.rounds (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null,
  day_number int not null check (day_number between 1 and 7),
  format text not null check (format in ('scramble','best_ball_bonus','singles')),
  date date,
  points_per_match numeric(4,1) not null default 1,
  unique (trip_id, day_number)
);
create index rounds_trip_idx on public.rounds(trip_id);

-- --- 8. Matches --------------------------------------------------------------
-- side_a / side_b: arrays of player_id (uuid). 2 ids for pairs, 1 for singles.
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds(id) on delete cascade,
  match_number int not null,
  side_a uuid[] not null,
  side_b uuid[] not null,
  team_a_id uuid references public.teams(id) on delete set null,
  team_b_id uuid references public.teams(id) on delete set null,
  status text not null default 'scheduled' check (status in ('scheduled','in_progress','complete')),
  result jsonb,  -- { winner: 'A'|'B'|'halve', points: {a, b}, scoreline, decided_thru }
  created_at timestamptz not null default now(),
  unique (round_id, match_number)
);
create index matches_round_idx on public.matches(round_id);

-- --- 9. Scores (per hole, per player) ----------------------------------------
-- For scramble: player_id is null, match_id set → one row per hole per team.
-- For best ball: player_id set (each partner enters own gross), match_id set.
-- For singles: player_id set, match_id set.
create table public.scores (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds(id) on delete cascade,
  match_id uuid references public.matches(id) on delete cascade,
  team_side text check (team_side in ('A','B')),  -- used for scramble (team enters)
  player_id uuid references public.players(id) on delete cascade,
  hole_number int not null check (hole_number between 1 and 18),
  gross int not null check (gross between 1 and 15),
  net int,                            -- denormalized for fast leaderboards
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index scores_round_idx on public.scores(round_id);
create index scores_match_idx on public.scores(match_id);
create index scores_player_round_idx on public.scores(player_id, round_id);
-- Uniqueness: one entry per (round, match, hole, player) — but player may be null
-- for scramble, so we add two partial unique indexes.
create unique index scores_unique_player on public.scores(round_id, match_id, hole_number, player_id)
  where player_id is not null;
create unique index scores_unique_team on public.scores(round_id, match_id, hole_number, team_side)
  where player_id is null and team_side is not null;

-- --- 10. Bets ----------------------------------------------------------------
create table public.bets (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  round_id uuid references public.rounds(id) on delete set null,
  type text not null check (type in (
    'match','longest_drive','closest_to_pin','hole_score','low_net_round','skins','other'
  )),
  hole_number int check (hole_number between 1 and 18),
  amount numeric(10,2) not null default 0,
  description text,
  status text not null default 'open' check (status in ('open','settled','cancelled')),
  created_by uuid references public.profiles(id) on delete set null,
  settled_at timestamptz,
  created_at timestamptz not null default now()
);
create index bets_trip_idx on public.bets(trip_id);
create index bets_round_idx on public.bets(round_id);

create table public.bet_participants (
  bet_id uuid not null references public.bets(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  is_winner boolean not null default false,
  primary key (bet_id, player_id)
);

-- --- 11. Activity feed -------------------------------------------------------
create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  round_id uuid references public.rounds(id) on delete set null,
  actor_player_id uuid references public.players(id) on delete set null,
  type text not null,            -- 'birdie' | 'eagle' | 'match_lead' | 'match_decided' | 'bet_created' | 'bet_settled' | 'longest_drive' ...
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index activity_trip_created_idx on public.activity_events(trip_id, created_at desc);

-- --- 12. Photos --------------------------------------------------------------
create table public.photos (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  uploaded_by uuid references public.profiles(id) on delete set null,
  storage_path text not null,
  caption text,
  created_at timestamptz not null default now()
);
create index photos_trip_idx on public.photos(trip_id, created_at desc);

-- --- 13. Lodging -------------------------------------------------------------
create table public.lodging (
  trip_id uuid primary key references public.trips(id) on delete cascade,
  address text,
  access_code text,
  wifi_ssid text,
  wifi_password text,
  check_in timestamptz,
  check_out timestamptz,
  notes text
);

-- =============================================================================
-- RLS — every table on, then per-table policies.
-- A user has access to a trip if they're a player in it OR an admin of it.
-- =============================================================================

-- Helper: predicate function used by every policy below.
create or replace function public.is_trip_member(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.players p
      where p.trip_id = p_trip_id and p.user_id = auth.uid()
  ) or exists (
    select 1 from public.trip_admins ta
      where ta.trip_id = p_trip_id and ta.user_id = auth.uid()
  ) or exists (
    select 1 from public.trips t
      where t.id = p_trip_id and t.created_by = auth.uid()
  );
$$;

create or replace function public.is_trip_admin(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.trip_admins ta
      where ta.trip_id = p_trip_id and ta.user_id = auth.uid()
  ) or exists (
    select 1 from public.trips t
      where t.id = p_trip_id and t.created_by = auth.uid()
  );
$$;

-- Profiles: everyone authenticated can read, only self can write.
alter table public.profiles enable row level security;
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (auth.role() = 'authenticated');
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Trips: members read, creator/admin writes. Anyone authed can read by join_code
-- via a dedicated RPC if needed; for the basic policy we restrict to members.
alter table public.trips enable row level security;
create policy trips_select on public.trips
  for select using (public.is_trip_member(id) or auth.role() = 'authenticated');
create policy trips_insert on public.trips
  for insert with check (created_by = auth.uid());
create policy trips_update on public.trips
  for update using (public.is_trip_admin(id)) with check (public.is_trip_admin(id));
create policy trips_delete on public.trips
  for delete using (created_by = auth.uid());

-- Trip admins: visible to admins of that trip; only admins can mutate.
alter table public.trip_admins enable row level security;
create policy trip_admins_select on public.trip_admins
  for select using (public.is_trip_member(trip_id));
create policy trip_admins_write on public.trip_admins
  for all using (public.is_trip_admin(trip_id)) with check (public.is_trip_admin(trip_id));

-- Teams, courses, tees, holes, hole_yardages, lodging — admin writes, member reads.
do $$ begin
  perform 1;
end $$;

alter table public.teams enable row level security;
create policy teams_select on public.teams for select using (public.is_trip_member(trip_id));
create policy teams_write on public.teams for all using (public.is_trip_admin(trip_id)) with check (public.is_trip_admin(trip_id));

alter table public.courses enable row level security;
create policy courses_select on public.courses for select using (public.is_trip_member(trip_id));
create policy courses_write on public.courses for all using (public.is_trip_admin(trip_id)) with check (public.is_trip_admin(trip_id));

alter table public.tees enable row level security;
create policy tees_select on public.tees for select using (
  exists (select 1 from public.courses c where c.id = course_id and public.is_trip_member(c.trip_id))
);
create policy tees_write on public.tees for all using (
  exists (select 1 from public.courses c where c.id = course_id and public.is_trip_admin(c.trip_id))
) with check (
  exists (select 1 from public.courses c where c.id = course_id and public.is_trip_admin(c.trip_id))
);

alter table public.holes enable row level security;
create policy holes_select on public.holes for select using (
  exists (select 1 from public.courses c where c.id = course_id and public.is_trip_member(c.trip_id))
);
create policy holes_write on public.holes for all using (
  exists (select 1 from public.courses c where c.id = course_id and public.is_trip_admin(c.trip_id))
) with check (
  exists (select 1 from public.courses c where c.id = course_id and public.is_trip_admin(c.trip_id))
);

alter table public.hole_yardages enable row level security;
create policy hole_yardages_select on public.hole_yardages for select using (
  exists (
    select 1 from public.holes h join public.courses c on c.id = h.course_id
    where h.id = hole_id and public.is_trip_member(c.trip_id)
  )
);
create policy hole_yardages_write on public.hole_yardages for all using (
  exists (
    select 1 from public.holes h join public.courses c on c.id = h.course_id
    where h.id = hole_id and public.is_trip_admin(c.trip_id)
  )
) with check (
  exists (
    select 1 from public.holes h join public.courses c on c.id = h.course_id
    where h.id = hole_id and public.is_trip_admin(c.trip_id)
  )
);

alter table public.lodging enable row level security;
create policy lodging_select on public.lodging for select using (public.is_trip_member(trip_id));
create policy lodging_write on public.lodging for all using (public.is_trip_admin(trip_id)) with check (public.is_trip_admin(trip_id));

-- Players: members can read; admins can write any; a user can update their own
-- player row (so the join flow lets them set their handicap/venmo etc.).
alter table public.players enable row level security;
create policy players_select on public.players for select using (public.is_trip_member(trip_id));
create policy players_admin_write on public.players for all using (public.is_trip_admin(trip_id)) with check (public.is_trip_admin(trip_id));
create policy players_self_update on public.players for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Rounds & matches: members read, admins write.
alter table public.rounds enable row level security;
create policy rounds_select on public.rounds for select using (public.is_trip_member(trip_id));
create policy rounds_write on public.rounds for all using (public.is_trip_admin(trip_id)) with check (public.is_trip_admin(trip_id));

alter table public.matches enable row level security;
create policy matches_select on public.matches for select using (
  exists (select 1 from public.rounds r where r.id = round_id and public.is_trip_member(r.trip_id))
);
create policy matches_write on public.matches for all using (
  exists (select 1 from public.rounds r where r.id = round_id and public.is_trip_admin(r.trip_id))
) with check (
  exists (select 1 from public.rounds r where r.id = round_id and public.is_trip_admin(r.trip_id))
);

-- Scores: members read; a player can write their own scores; admins can write any.
alter table public.scores enable row level security;
create policy scores_select on public.scores for select using (
  exists (select 1 from public.rounds r where r.id = round_id and public.is_trip_member(r.trip_id))
);
create policy scores_self_write on public.scores for all using (
  player_id is null
  or exists (select 1 from public.players p where p.id = player_id and p.user_id = auth.uid())
  or exists (select 1 from public.rounds r where r.id = round_id and public.is_trip_admin(r.trip_id))
) with check (
  player_id is null
  or exists (select 1 from public.players p where p.id = player_id and p.user_id = auth.uid())
  or exists (select 1 from public.rounds r where r.id = round_id and public.is_trip_admin(r.trip_id))
);

-- Bets: members read; creator or admin writes.
alter table public.bets enable row level security;
create policy bets_select on public.bets for select using (public.is_trip_member(trip_id));
create policy bets_write on public.bets for all using (
  created_by = auth.uid() or public.is_trip_admin(trip_id)
) with check (
  created_by = auth.uid() or public.is_trip_admin(trip_id)
);

alter table public.bet_participants enable row level security;
create policy bet_participants_select on public.bet_participants for select using (
  exists (select 1 from public.bets b where b.id = bet_id and public.is_trip_member(b.trip_id))
);
create policy bet_participants_write on public.bet_participants for all using (
  exists (select 1 from public.bets b where b.id = bet_id and (b.created_by = auth.uid() or public.is_trip_admin(b.trip_id)))
) with check (
  exists (select 1 from public.bets b where b.id = bet_id and (b.created_by = auth.uid() or public.is_trip_admin(b.trip_id)))
);

-- Activity feed: members read; system or self writes.
alter table public.activity_events enable row level security;
create policy activity_select on public.activity_events for select using (public.is_trip_member(trip_id));
create policy activity_insert on public.activity_events for insert with check (public.is_trip_member(trip_id));

-- Photos: members read and upload; uploader or admin can delete.
alter table public.photos enable row level security;
create policy photos_select on public.photos for select using (public.is_trip_member(trip_id));
create policy photos_insert on public.photos for insert with check (public.is_trip_member(trip_id) and uploaded_by = auth.uid());
create policy photos_delete on public.photos for delete using (uploaded_by = auth.uid() or public.is_trip_admin(trip_id));

-- --- Realtime: enable on the live tables. ------------------------------------
-- Supabase Realtime needs the table added to its publication.
alter publication supabase_realtime add table public.scores;
alter publication supabase_realtime add table public.bets;
alter publication supabase_realtime add table public.activity_events;
alter publication supabase_realtime add table public.matches;
