-- =============================================================================
-- 0006_harden_function_grants.sql
--
-- Address Supabase security advisors: SECURITY DEFINER functions in the public
-- schema are exposed as PostgREST RPC endpoints. Default function EXECUTE is
-- granted to PUBLIC (the pseudo-role), so revokes must target PUBLIC — a
-- role-specific `revoke ... from anon` is a no-op against that grant.
--
--  - handle_new_user(): trigger-only. Trigger firing does not re-check the
--    DML user's EXECUTE privilege, so revoking PUBLIC doesn't break signups.
--  - is_trip_member / is_trip_admin: RLS policies evaluate these AS THE
--    CALLING USER, so `authenticated` keeps an explicit EXECUTE grant.
--    `anon` loses access — no signed-out page queries the DB.
-- =============================================================================

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.is_trip_member(uuid) from public;
revoke execute on function public.is_trip_admin(uuid) from public;

-- Helpers stay executable by signed-in users (RLS policies run as the caller).
grant execute on function public.is_trip_member(uuid) to authenticated;
grant execute on function public.is_trip_admin(uuid) to authenticated;

-- Future functions: don't hand EXECUTE to everyone by default.
alter default privileges in schema public revoke execute on functions from public;
