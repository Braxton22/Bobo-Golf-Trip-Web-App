-- =============================================================================
-- 0010_player_round_settings.sql
--
-- Tee selection and tee time vary by day — pulling them off the player profile
-- and putting them on a (round, player) row. We keep the legacy player columns
-- for now (admin code stops reading them; future migration can drop) so the
-- column drop and the deploy can land independently.
-- =============================================================================

create table if not exists public.player_round_settings (
  round_id uuid not null references public.rounds(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  tee_id uuid references public.tees(id) on delete set null,
  tee_time time,
  primary key (round_id, player_id)
);
create index if not exists prs_round_idx on public.player_round_settings(round_id);

alter table public.player_round_settings enable row level security;

-- Members of a trip can read all per-round settings for that trip.
drop policy if exists prs_select on public.player_round_settings;
create policy prs_select on public.player_round_settings
  for select using (
    exists (
      select 1 from public.rounds r
      where r.id = round_id and public.is_trip_member(r.trip_id)
    )
  );

-- Admins write any; a player can update their OWN row (lets a player tweak
-- their tee time after the admin set up the round).
drop policy if exists prs_admin_write on public.player_round_settings;
create policy prs_admin_write on public.player_round_settings
  for all using (
    exists (
      select 1 from public.rounds r
      where r.id = round_id and public.is_trip_admin(r.trip_id)
    )
  ) with check (
    exists (
      select 1 from public.rounds r
      where r.id = round_id and public.is_trip_admin(r.trip_id)
    )
  );

drop policy if exists prs_self_update on public.player_round_settings;
create policy prs_self_update on public.player_round_settings
  for update using (
    exists (select 1 from public.players p where p.id = player_id and p.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.players p where p.id = player_id and p.user_id = auth.uid())
  );
