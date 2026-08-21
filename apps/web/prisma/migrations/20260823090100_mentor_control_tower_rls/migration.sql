-- Row-Level Security for the partial Mentor Control Tower -- Blueprint 08
-- Part One, Section Three (the instrument itself) and Blueprint 11 Section
-- Eleven (the compensation firewall, enforced structurally by this
-- module's own design -- see mentor-control-tower.ts's own top comment,
-- not by anything in this migration). Architecture Spec Part Six's "two
-- layers, not one" -- the same pattern every prior phase's new access
-- pattern has followed.
--
-- A new session-context helper, mirroring app_actor_is_mentor_of and
-- app_actor_is_parent_of exactly: this one answers "is the acting session
-- an active Regional Steward whose own region-proxy (circleId ->
-- regionId) matches the target Mentor Role's own region-proxy." Named
-- explicitly as a proxy in mentor-control-tower.ts's own top comment and
-- in this migration's own comments -- it is the same imprecise signal
-- throughout, not a guarantee that every learner on that Mentor's caseload
-- is actually in that region.
--
-- A Mentor or Regional Steward with no circleId, or whose circle has no
-- regionId, simply never matches (the INNER JOINs below exclude them) --
-- fails closed by construction, not by an extra NULL check.

CREATE OR REPLACE FUNCTION app_actor_is_regional_steward_of_mentor_role(target_mentor_role_id text) RETURNS boolean
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM roles mentor_role
    JOIN users mentor_user ON mentor_user.id = mentor_role.user_id
    JOIN circles mentor_circle ON mentor_circle.id = mentor_user.circle_id
    JOIN users steward_user ON steward_user.id = app_current_user_id()
    JOIN circles steward_circle ON steward_circle.id = steward_user.circle_id
    WHERE mentor_role.id = target_mentor_role_id
      AND mentor_circle.region_id = steward_circle.region_id
      AND app_actor_has_active_role('REGIONAL_STEWARD')
  )
$$;

-- ============================================================================
-- ROLES -- a Regional Steward may additionally read a MENTOR-type Role row
-- belonging to their own region (via the proxy above). Every other role
-- type, and every Mentor outside their region, remains invisible to them
-- at this table -- unlike Administrator's own unconditional read here, this
-- is scoped, not blanket.
-- ============================================================================

DROP POLICY IF EXISTS "roles_select" ON "roles";

CREATE POLICY "roles_select" ON "roles"
  FOR SELECT
  USING (
    "user_id" = app_current_user_id()
    OR app_actor_has_active_role('ADMINISTRATOR')
    OR app_actor_has_active_role('FOUNDER')
    OR ("role_type" = 'MENTOR' AND app_actor_is_regional_steward_of_mentor_role("id"))
  );

-- ============================================================================
-- MENTOR_ASSIGNMENTS -- the caseload signal's own source table. Administrator
-- access already existed (unconditional); this adds the region-scoped
-- Regional Steward case alongside it.
-- ============================================================================

DROP POLICY IF EXISTS "mentor_assignments_select" ON "mentor_assignments";

CREATE POLICY "mentor_assignments_select" ON "mentor_assignments"
  FOR SELECT
  USING (
    "learner_user_id" = app_current_user_id()
    OR EXISTS (
      SELECT 1 FROM roles r
      WHERE r.id = mentor_assignments.mentor_role_id
        AND r.user_id = app_current_user_id()
    )
    OR app_actor_is_parent_of("learner_user_id")
    OR app_actor_has_active_role('ADMINISTRATOR')
    OR app_actor_is_regional_steward_of_mentor_role("mentor_role_id")
  );

-- ============================================================================
-- MENTOR_SESSION_TRANSCRIPTS -- the session-frequency signal's own source
-- table. Neither Administrator nor Regional Steward had any access here
-- before this migration; both are added now, scoped identically to the two
-- tables above.
--
-- Residual limitation, named rather than smoothed over (the same
-- discipline the Audit Log's own RLS migration comment already applies to
-- itself): this is row-level access, not column-level. A visible row's
-- `transcript_text` column is technically readable by any query the
-- application code chooses to write, even though the Mentor Control
-- Tower's own query (mentor-control-tower.ts) deliberately selects only
-- `learner_user_id` and `scheduled_for`, never `transcript_text` --
-- governance's own "session data" framing for this signal means frequency,
-- not content. Postgres row-level security does not restrict columns
-- within a visible row; enforcing that narrower boundary at the database
-- layer too would require column-level grants this project's RLS
-- convention has not used anywhere else, and building that mechanism is
-- not this task's own scope.
-- ============================================================================

DROP POLICY IF EXISTS "mentor_session_transcripts_select" ON "mentor_session_transcripts";

CREATE POLICY "mentor_session_transcripts_select" ON "mentor_session_transcripts"
  FOR SELECT
  USING (
    "learner_user_id" = app_current_user_id()
    OR app_actor_is_mentor_of("learner_user_id")
    OR app_actor_is_parent_of("learner_user_id")
    OR app_actor_has_active_role('ADMINISTRATOR')
    OR app_actor_is_regional_steward_of_mentor_role("mentor_role_id")
  );
