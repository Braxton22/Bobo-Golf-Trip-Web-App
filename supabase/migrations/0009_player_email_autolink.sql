-- =============================================================================
-- 0009_player_email_autolink.sql
--
-- Let the admin attach an email to each player row, then auto-link the row to
-- the matching auth account when that user signs in. This means players don't
-- need to walk through /join/<code> for the site to know whose score is whose.
-- =============================================================================

alter table public.players add column if not exists email text;
create index if not exists players_email_lower_idx on public.players (lower(email));

-- Function the app calls on every entry path (signed-in surface area).
-- SECURITY DEFINER so it can write to rows the caller doesn't yet own — it
-- only ever links rows whose email exactly matches the caller's JWT email
-- AND that aren't already linked to someone else.
create or replace function public.link_players_to_me()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  caller_id uuid := auth.uid();
  caller_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  linked int := 0;
begin
  if caller_id is null or caller_email = '' then return 0; end if;

  with claimed as (
    update public.players
       set user_id = caller_id
     where user_id is null
       and lower(email) = caller_email
       -- Defend the partial unique index (one player per (trip,user)).
       and not exists (
         select 1 from public.players p2
         where p2.trip_id = public.players.trip_id
           and p2.user_id = caller_id
       )
     returning 1
  )
  select count(*) into linked from claimed;

  return linked;
end;
$$;

revoke execute on function public.link_players_to_me() from public;
grant execute on function public.link_players_to_me() to authenticated;
