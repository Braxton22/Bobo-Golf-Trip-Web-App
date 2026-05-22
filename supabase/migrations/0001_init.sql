-- Bobo Golf Trip schema
-- Run this in Supabase: SQL Editor -> paste -> Run.

create extension if not exists "pgcrypto";

-- A row per app user (mirrors auth.users). Created on signup via trigger below.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  handicap numeric(4,1),
  created_at timestamptz not null default now()
);

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text,
  starts_on date,
  ends_on date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Membership: who is on a given trip.
create table if not exists public.trip_members (
  trip_id uuid not null references public.trips(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'player' check (role in ('player','organizer')),
  joined_at timestamptz not null default now(),
  primary key (trip_id, profile_id)
);

create table if not exists public.airbnbs (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  name text not null,
  address text,
  url text,
  check_in date,
  check_out date,
  total_cost numeric(10,2),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.rounds (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  course_name text not null,
  played_on date not null,
  par int,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.scores (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  total_strokes int not null,
  created_at timestamptz not null default now(),
  unique (round_id, profile_id)
);

-- Side bets between buddies. Keep it loose -- the boys can describe whatever.
create table if not exists public.bets (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  round_id uuid references public.rounds(id) on delete set null,
  description text not null,
  amount numeric(10,2) not null default 0,
  proposed_by uuid references public.profiles(id) on delete set null,
  winner_id uuid references public.profiles(id) on delete set null,
  status text not null default 'open' check (status in ('open','settled','cancelled')),
  created_at timestamptz not null default now()
);

-- Auto-create a profile row on signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Row Level Security: members of a trip can read/write its data.
alter table public.profiles      enable row level security;
alter table public.trips         enable row level security;
alter table public.trip_members  enable row level security;
alter table public.airbnbs       enable row level security;
alter table public.rounds        enable row level security;
alter table public.scores        enable row level security;
alter table public.bets          enable row level security;

-- Helper: is the current user a member of a given trip?
create or replace function public.is_trip_member(_trip uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.trip_members
    where trip_id = _trip and profile_id = auth.uid()
  );
$$;

-- Profiles: anyone signed in can read display names; only you edit your own.
drop policy if exists "profiles read"   on public.profiles;
drop policy if exists "profiles update" on public.profiles;
create policy "profiles read"
  on public.profiles for select to authenticated using (true);
create policy "profiles update"
  on public.profiles for update to authenticated using (id = auth.uid());

-- Trips: members can read; any signed-in user can create; creator/organizer can update.
drop policy if exists "trips read"   on public.trips;
drop policy if exists "trips insert" on public.trips;
drop policy if exists "trips update" on public.trips;
create policy "trips read"
  on public.trips for select to authenticated
  using (public.is_trip_member(id) or created_by = auth.uid());
create policy "trips insert"
  on public.trips for insert to authenticated
  with check (created_by = auth.uid());
create policy "trips update"
  on public.trips for update to authenticated
  using (created_by = auth.uid());

-- Trip members: any member can see the roster; you can add yourself; creator can add anyone.
drop policy if exists "members read"   on public.trip_members;
drop policy if exists "members insert" on public.trip_members;
drop policy if exists "members delete" on public.trip_members;
create policy "members read"
  on public.trip_members for select to authenticated
  using (public.is_trip_member(trip_id));
create policy "members insert"
  on public.trip_members for insert to authenticated
  with check (
    profile_id = auth.uid()
    or exists (select 1 from public.trips t where t.id = trip_id and t.created_by = auth.uid())
  );
create policy "members delete"
  on public.trip_members for delete to authenticated
  using (
    profile_id = auth.uid()
    or exists (select 1 from public.trips t where t.id = trip_id and t.created_by = auth.uid())
  );

-- Generic "members can do everything" policies for the per-trip tables.
do $$
declare t text;
begin
  foreach t in array array['airbnbs','rounds','scores','bets'] loop
    execute format('drop policy if exists "%s members all" on public.%I;', t, t);
  end loop;
end $$;

create policy "airbnbs members all"
  on public.airbnbs for all to authenticated
  using (public.is_trip_member(trip_id))
  with check (public.is_trip_member(trip_id));

create policy "rounds members all"
  on public.rounds for all to authenticated
  using (public.is_trip_member(trip_id))
  with check (public.is_trip_member(trip_id));

create policy "scores members all"
  on public.scores for all to authenticated
  using (
    exists (
      select 1 from public.rounds r
      where r.id = round_id and public.is_trip_member(r.trip_id)
    )
  )
  with check (
    exists (
      select 1 from public.rounds r
      where r.id = round_id and public.is_trip_member(r.trip_id)
    )
  );

create policy "bets members all"
  on public.bets for all to authenticated
  using (public.is_trip_member(trip_id))
  with check (public.is_trip_member(trip_id));
