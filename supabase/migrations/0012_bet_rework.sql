-- =============================================================================
-- 0012_bet_rework.sql
--
-- Replaces the freeform side-bet flow with two structured concepts:
--
--   match_bets   — placed in advance on a specific match. Placer picks a side;
--                  any other player can "take" the bet at the same amount on
--                  the opposite side. You cannot back your own opponent for
--                  that day. Auto-settles when the match has a result.
--
--   round_pots   — per-round opt-in pots ($10 each by default) for skins,
--                  deuces, and low-net. Opt-in window closes the moment the
--                  first score is posted on that round. If a round's pot has
--                  no winners, the whole pot carries to the next round's pot
--                  of the same type.
--
-- The legacy `bets` / `bet_participants` tables are kept (no drop) so any
-- historical data on a finished trip remains intact, but the app stops
-- reading from them.
-- =============================================================================

create table if not exists public.match_bets (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  placer_player_id uuid not null references public.players(id) on delete cascade,
  side text not null check (side in ('A','B')),
  amount numeric(10,2) not null check (amount > 0),
  taker_player_id uuid references public.players(id) on delete set null,
  taken_at timestamptz,
  settled_at timestamptz,
  -- 'placer' = placer's side won; 'taker' = taker's side won; 'halve' = push
  outcome text check (outcome in ('placer','taker','halve','cancelled')),
  created_at timestamptz not null default now()
);
create index if not exists match_bets_trip_idx on public.match_bets(trip_id);
create index if not exists match_bets_match_idx on public.match_bets(match_id);

alter table public.match_bets enable row level security;

drop policy if exists match_bets_select on public.match_bets;
create policy match_bets_select on public.match_bets
  for select using (public.is_trip_member(trip_id));

-- Anyone on the trip can create a bet, and a placer can update/cancel their
-- own open bet. Admins can do anything.
drop policy if exists match_bets_write on public.match_bets;
create policy match_bets_write on public.match_bets
  for all
  using (
    public.is_trip_admin(trip_id)
    or exists (
      select 1 from public.players p
      where p.id = placer_player_id and p.user_id = auth.uid()
    )
    or exists (
      select 1 from public.players p
      where p.id = taker_player_id and p.user_id = auth.uid()
    )
  )
  with check (
    public.is_trip_admin(trip_id)
    or exists (
      select 1 from public.players p
      where p.id = placer_player_id and p.user_id = auth.uid()
    )
    or exists (
      select 1 from public.players p
      where p.id = taker_player_id and p.user_id = auth.uid()
    )
  );

-- A player can take an open bet — DB-side guard ensures they're not backing
-- their own opponent.
create or replace function public.match_bet_can_be_taken_by(
  p_bet_id uuid,
  p_user uuid
) returns boolean
language sql stable security definer set search_path = public as $$
  with b as (
    select mb.id, mb.match_id, mb.side, mb.placer_player_id, mb.taker_player_id,
           m.side_a, m.side_b, m.round_id, r.trip_id
    from public.match_bets mb
    join public.matches m on m.id = mb.match_id
    join public.rounds r on r.id = m.round_id
    where mb.id = p_bet_id
  ),
  pl as (
    select id from public.players where user_id = p_user
  )
  select case
    -- Bet must still be open
    when (select taker_player_id from b) is not null then false
    -- The user must have a player row on this trip
    when not exists (
      select 1 from public.players p, b
      where p.user_id = p_user and p.trip_id = b.trip_id
    ) then false
    -- Can't take your own bet
    when exists (
      select 1 from pl, b
      where pl.id = b.placer_player_id
    ) then false
    -- Backing the OPPOSITE side ("side" stays with the placer; the taker takes
    -- the other side). If the user is on the SAME side as `side`, they would
    -- be backing their own opponent → forbid.
    when (select side from b) = 'A' and exists (
      select 1 from pl, b
      where pl.id = any(b.side_a)
    ) then false
    when (select side from b) = 'B' and exists (
      select 1 from pl, b
      where pl.id = any(b.side_b)
    ) then false
    else true
  end;
$$;
grant execute on function public.match_bet_can_be_taken_by(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Round pots: skins / deuces / low net
-- ---------------------------------------------------------------------------

create table if not exists public.round_pot_entries (
  round_id uuid not null references public.rounds(id) on delete cascade,
  pot_type text not null check (pot_type in ('skins','deuces','low_net')),
  player_id uuid not null references public.players(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (round_id, pot_type, player_id)
);
create index if not exists rpe_round_idx on public.round_pot_entries(round_id);

alter table public.round_pot_entries enable row level security;

drop policy if exists rpe_select on public.round_pot_entries;
create policy rpe_select on public.round_pot_entries
  for select using (
    exists (
      select 1 from public.rounds r
      where r.id = round_id and public.is_trip_member(r.trip_id)
    )
  );

-- A player can opt themselves in/out before the round starts. The "before
-- the round starts" gate lives in the server action (which checks for any
-- score on the round); RLS just verifies identity.
drop policy if exists rpe_self_write on public.round_pot_entries;
create policy rpe_self_write on public.round_pot_entries
  for all
  using (
    exists (
      select 1 from public.players p
      where p.id = player_id and p.user_id = auth.uid()
    )
    or exists (
      select 1 from public.rounds r
      where r.id = round_id and public.is_trip_admin(r.trip_id)
    )
  )
  with check (
    exists (
      select 1 from public.players p
      where p.id = player_id and p.user_id = auth.uid()
    )
    or exists (
      select 1 from public.rounds r
      where r.id = round_id and public.is_trip_admin(r.trip_id)
    )
  );

-- Realtime: include these so /bets refreshes when someone opts in.
alter publication supabase_realtime add table public.match_bets;
alter publication supabase_realtime add table public.round_pot_entries;
