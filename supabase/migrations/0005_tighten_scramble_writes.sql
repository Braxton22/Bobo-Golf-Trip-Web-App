-- =============================================================================
-- 0005_tighten_scramble_writes.sql
--
-- Tighten the scores RLS so that scramble team scores (team_side set,
-- player_id null) can only be written by a player who's actually on that side
-- of the match. Admins of the trip still bypass.
--
-- Previously: any trip member could write any team score because the policy
-- short-circuited on `player_id is null`.
-- =============================================================================

drop policy if exists scores_self_write on public.scores;

create policy scores_self_write on public.scores
  for all
  using (
    -- Admin of the round's trip — always allowed.
    exists (
      select 1 from public.rounds r
      where r.id = round_id and public.is_trip_admin(r.trip_id)
    )
    -- Writing your own score (singles / best-ball).
    or (
      player_id is not null
      and exists (
        select 1 from public.players p
        where p.id = player_id and p.user_id = auth.uid()
      )
    )
    -- Scramble team score: must be on the same side of this match.
    or (
      player_id is null
      and team_side is not null
      and exists (
        select 1
        from public.matches m
        join public.players p on (
          (team_side = 'A' and p.id = any(m.side_a))
          or (team_side = 'B' and p.id = any(m.side_b))
        )
        where m.id = match_id and p.user_id = auth.uid()
      )
    )
  )
  with check (
    exists (
      select 1 from public.rounds r
      where r.id = round_id and public.is_trip_admin(r.trip_id)
    )
    or (
      player_id is not null
      and exists (
        select 1 from public.players p
        where p.id = player_id and p.user_id = auth.uid()
      )
    )
    or (
      player_id is null
      and team_side is not null
      and exists (
        select 1
        from public.matches m
        join public.players p on (
          (team_side = 'A' and p.id = any(m.side_a))
          or (team_side = 'B' and p.id = any(m.side_b))
        )
        where m.id = match_id and p.user_id = auth.uid()
      )
    )
  );
