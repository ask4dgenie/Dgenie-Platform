-- Phase 1, Slice A -- a gap found while writing New Learner Onboarding's own
-- service code (src/modules/identity/mentor-assignment.ts).
--
-- Workflow 1's own text: an Administrator "assigns a first Mentor from
-- available caseload capacity." Finding a Mentor with capacity requires
-- querying which Role rows are MENTOR-type at all -- but Phase 0's
-- `roles_select_own` policy only ever let a session see its own Role rows,
-- since Phase 0 shipped nothing user-facing and had no workflow that needed
-- to browse other people's roles. This is the first Phase 1 write path that
-- actually needs it. Scoped narrowly to the ADMINISTRATOR (and FOUNDER, for
-- symmetry with `roles_insert_administrator`) actor, re-resolved at query
-- time per Architecture Spec Part Six's dynamic-role-resolution principle --
-- not opened to every authenticated session.

CREATE POLICY "roles_select_administrator" ON "roles"
  FOR SELECT
  USING (
    app_actor_has_active_role('ADMINISTRATOR')
    OR app_actor_has_active_role('FOUNDER')
  );
