-- Phase 1, Slice A -- fixes findings from Supabase's performance advisor
-- (`multiple_permissive_policies`, run per this slice's own "get_advisors
-- after every migration" instruction), run after the migrations above.
--
-- Two different situations, two different fixes:
--
-- "accounts" and "sessions" (pre-existing since Phase 0, not previously
-- checked with the performance advisor -- only the security advisor was run
-- in Phase 0): `accounts_select_own` / `sessions_select_own` are strictly
-- redundant once `accounts_all_service` / `sessions_all_service` exist --
-- a permissive `USING (true)` policy already allows every SELECT the
-- narrower own-row policy would also allow, since permissive policies
-- combine with OR. The narrower policies add a second policy evaluation on
-- every query with zero actual access-control effect, so they are dropped
-- outright, not merged.
--
-- "roles" (introduced by this slice's own `roles_select_administrator`,
-- 20260818090300): `roles_select_own` and `roles_select_administrator` are
-- NOT redundant -- they cover genuinely different actors -- so these are
-- merged into one policy with the same combined condition, rather than
-- dropped, preserving identical access semantics with one policy
-- evaluation instead of two.

DROP POLICY IF EXISTS "accounts_select_own" ON "accounts";
DROP POLICY IF EXISTS "sessions_select_own" ON "sessions";

DROP POLICY IF EXISTS "roles_select_own" ON "roles";
DROP POLICY IF EXISTS "roles_select_administrator" ON "roles";

CREATE POLICY "roles_select" ON "roles"
  FOR SELECT
  USING (
    "user_id" = app_current_user_id()
    OR app_actor_has_active_role('ADMINISTRATOR')
    OR app_actor_has_active_role('FOUNDER')
  );
