-- =============================================================================
-- 0011_trip_types.sql
--
-- Multi-format trips. A trip is either the classic 'ryder_cup' (two teams,
-- three days, the Cup — all existing behavior) or 'casual' (no teams; each
-- round picks its own format). New round formats for casual trips:
--
--   medal          — everyone plays own ball, net/gross stroke play board
--   stableford     — points per hole off net (bogey 1, par 2, birdie 3 …)
--   skins          — net skins, ties carry the pot to the next hole
--   count_birdies  — gross birdies 2 pts, eagles+ 4 pts; trip-cumulative board
--                    with the final round's back nine counting double
--   match_play     — 1v1 net match play, no team layer
--   group_scramble — groups post one ball; board ranks groups by gross to par
--
-- Solo formats store scores keyed by (round, player) with match_id NULL, which
-- needs its own partial unique index (NULLs never collide in the existing one).
-- =============================================================================

alter table public.trips
  add column if not exists trip_type text not null default 'ryder_cup';
alter table public.trips
  drop constraint if exists trips_trip_type_check;
alter table public.trips
  add constraint trips_trip_type_check check (trip_type in ('ryder_cup','casual'));

alter table public.rounds drop constraint if exists rounds_format_check;
alter table public.rounds add constraint rounds_format_check check (format in (
  'scramble','best_ball_bonus','singles',
  'medal','stableford','skins','count_birdies','match_play','group_scramble'
));

-- Casual trips can run more than a long weekend.
alter table public.rounds drop constraint if exists rounds_day_number_check;
alter table public.rounds add constraint rounds_day_number_check
  check (day_number between 1 and 14);

-- One score per (round, hole, player) when there's no match attached.
create unique index if not exists scores_unique_solo
  on public.scores(round_id, hole_number, player_id)
  where player_id is not null and match_id is null;
