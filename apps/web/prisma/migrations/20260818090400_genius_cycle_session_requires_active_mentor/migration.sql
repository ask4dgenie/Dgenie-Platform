-- Phase 1, Slice A -- strengthens genius_cycle_sessions_insert_own
-- (20260818090100_phase1_slice_a_rls_and_grants) to enforce, at the
-- database layer, Architecture Spec Part Seven Workflow 1's own guarantee:
-- "the learner's first Genius Cycle session becomes available only once the
-- Mentor relationship is active -- a learner never begins working with an
-- unaccompanied Genie." Previously this was checked only in application
-- code (src/modules/learning/genius-cycle-session.ts's `startGeniusCycle
-- Session`); per Part Six's "two layers, not one," it belongs here too.

DROP POLICY IF EXISTS "genius_cycle_sessions_insert_own" ON "genius_cycle_sessions";

CREATE POLICY "genius_cycle_sessions_insert_own" ON "genius_cycle_sessions"
  FOR INSERT
  WITH CHECK (
    "learner_user_id" = app_current_user_id()
    AND EXISTS (
      SELECT 1 FROM mentor_assignments
      WHERE learner_user_id = genius_cycle_sessions.learner_user_id
        AND valid_to IS NULL
    )
  );
