-- Correction to 20260821120100_voice_lock_consent_and_avatar_write_rls.
--
-- That migration added `avatar_configurations_select_parent` alongside the
-- pre-existing `avatar_configurations_select_own` (PR#4), leaving two
-- separate permissive SELECT policies on the same table -- Supabase's own
-- performance advisor flagged this immediately after the migration was
-- applied (WARN, "Multiple Permissive Policies": "each policy must be
-- executed for every relevant query"). Every other multi-condition SELECT
-- policy elsewhere in this schema (e.g. `genius_cycle_sessions_select`,
-- `portfolio_entries_select`, `certification_records_select`) combines its
-- conditions with OR inside one policy, not as separate stacked policies --
-- this migration brings avatar_configurations back in line with that
-- established convention rather than leaving a new, inconsistent pattern
-- in place.

DROP POLICY IF EXISTS "avatar_configurations_select_own" ON "avatar_configurations";
DROP POLICY IF EXISTS "avatar_configurations_select_parent" ON "avatar_configurations";

CREATE POLICY "avatar_configurations_select" ON "avatar_configurations"
  FOR SELECT
  USING (
    "learner_user_id" = app_current_user_id()
    OR app_actor_is_parent_of("learner_user_id")
  );
