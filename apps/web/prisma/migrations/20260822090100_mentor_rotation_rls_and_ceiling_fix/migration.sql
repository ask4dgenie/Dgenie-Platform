-- Row-Level Security for mentor_handoffs, and a correction to
-- mentor_assignments_insert_ceiling the Mentor rotation task requires to
-- call it correctly (per that task's own explicit non-goal: "beyond what
-- rotation requires to call it correctly"). Architecture Spec Part Six's
-- "two layers, not one" -- the same pattern every prior phase's new table,
-- and every new write path on an existing table, has followed.

-- ============================================================================
-- MENTOR_HANDOFFS -- Blueprint 07 Part Five's handoff record. "Held jointly
-- by the outgoing Mentor, the incoming Mentor, and the learner, with the
-- family included where age-appropriate." SELECT is intentionally
-- unconditional for the learner's parent(s) regardless of `family_included`
-- -- that flag records whether the family took part in the conversation
-- itself, not whether they may read the record afterward, the same
-- transparency principle `mentor_session_transcripts` already carries
-- unconditionally for a parent. Only the two named Mentor Roles may write,
-- and only INSERT and UPDATE are granted at all (no DELETE) -- a handoff,
-- once scheduled, is not erased, only completed. The UPDATE policy's own
-- USING clause is what actually closes the write window once
-- completed_at is set: it evaluates against the OLD row, so a row that is
-- already complete is simply not a candidate for UPDATE at all, regardless
-- of what a WITH CHECK might otherwise allow.
-- ============================================================================

ALTER TABLE "mentor_handoffs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mentor_handoffs" FORCE ROW LEVEL SECURITY;

CREATE POLICY "mentor_handoffs_select" ON "mentor_handoffs"
  FOR SELECT
  USING (
    "learner_user_id" = app_current_user_id()
    OR EXISTS (
      SELECT 1 FROM roles r
      WHERE r.id IN (mentor_handoffs.outgoing_mentor_role_id, mentor_handoffs.incoming_mentor_role_id)
        AND r.user_id = app_current_user_id()
    )
    OR app_actor_is_parent_of("learner_user_id")
  );

CREATE POLICY "mentor_handoffs_insert" ON "mentor_handoffs"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM roles r
      WHERE r.id IN (mentor_handoffs.outgoing_mentor_role_id, mentor_handoffs.incoming_mentor_role_id)
        AND r.user_id = app_current_user_id()
    )
  );

CREATE POLICY "mentor_handoffs_update" ON "mentor_handoffs"
  FOR UPDATE
  USING (
    "completed_at" IS NULL
    AND EXISTS (
      SELECT 1 FROM roles r
      WHERE r.id IN (mentor_handoffs.outgoing_mentor_role_id, mentor_handoffs.incoming_mentor_role_id)
        AND r.user_id = app_current_user_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM roles r
      WHERE r.id IN (mentor_handoffs.outgoing_mentor_role_id, mentor_handoffs.incoming_mentor_role_id)
        AND r.user_id = app_current_user_id()
    )
  );

GRANT SELECT, INSERT, UPDATE ON "mentor_handoffs" TO dgenie_app;
REVOKE DELETE ON "mentor_handoffs" FROM dgenie_app;
REVOKE DELETE ON "mentor_handoffs" FROM PUBLIC;

-- ============================================================================
-- MENTOR_ASSIGNMENTS_INSERT_CEILING -- correction. The original policy
-- (20260818090100_phase1_slice_a_rls_and_grants) counted every active
-- assignment for the target Mentor Role, full stop. The Mentor rotation
-- task's own renewal path (mentor-rotation.ts) inserts a new row for the
-- SAME learner and the SAME Mentor Role, in the same transaction as, and
-- strictly before, closing the learner's prior row for that identical
-- pairing (the continuity guarantee: incoming created before outgoing
-- closed) -- so at the moment this INSERT's WITH CHECK evaluates, the
-- learner's own outgoing row for that Mentor is still active, and the
-- unmodified count would double-count the same learner-Mentor relationship
-- against the ceiling for an operation that changes that Mentor's real
-- caseload by zero, not by one. The corrected count excludes any existing
-- active assignment for the SAME learner as the row being inserted --
-- correct and harmless for a genuine rotation too, since the learner's
-- outgoing row there is for an entirely different Mentor Role and was
-- never part of the incoming Mentor's own count to begin with. Mirrors the
-- identical, symmetric application-layer correction in assignMentorTx
-- (src/modules/identity/mentor-assignment.ts).
-- ============================================================================

DROP POLICY IF EXISTS "mentor_assignments_insert_ceiling" ON "mentor_assignments";

CREATE POLICY "mentor_assignments_insert_ceiling" ON "mentor_assignments"
  FOR INSERT
  WITH CHECK (
    app_actor_has_active_role('ADMINISTRATOR')
    AND EXISTS (
      SELECT 1 FROM roles r
      WHERE r.id = mentor_assignments.mentor_role_id
        AND r.role_type = 'MENTOR'
        AND r.valid_to IS NULL
    )
    AND (
      SELECT COUNT(*) FROM mentor_assignments ma
      WHERE ma.mentor_role_id = mentor_assignments.mentor_role_id
        AND ma.valid_to IS NULL
        AND ma.learner_user_id <> mentor_assignments.learner_user_id
    ) < 20
  );
