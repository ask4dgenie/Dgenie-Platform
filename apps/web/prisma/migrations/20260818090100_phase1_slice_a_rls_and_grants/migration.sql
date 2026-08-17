-- Phase 1, Slice A -- Row-Level Security policies and grants for every table
-- created in the companion 20260818090000_phase1_slice_a_schema migration,
-- per Architecture Spec Part Six's "two layers, not one" and this prompt's
-- own instruction to follow Phase 0's RLS pattern exactly, not a parallel
-- style. See apps/web/src/lib/db/rls.ts for the application-side half of
-- this pattern (unchanged from Phase 0).

-- ============================================================================
-- NEW SESSION-CONTEXT HELPERS
--
-- Phase 0 established `app_current_user_id()`. Phase 1 adds two more, for
-- exactly the same reason: Architecture Spec Part Six's dynamic-role-
-- resolution principle -- "every access check resolves the current, valid
-- Role record at request time rather than trusting a role claim issued at
-- login" -- now has to answer two new questions on every write this slice
-- introduces: "is the acting session currently an active holder of role X,"
-- and "is the acting session the currently-assigned Mentor (or a linked
-- Parent) of learner Y." Both are derived from the same tables Phase 0
-- already made RLS-scoped (roles, parent_links) plus this slice's own
-- mentor_assignments -- never from a claim the application asserts.
-- ============================================================================

CREATE OR REPLACE FUNCTION app_actor_has_active_role(target_role_type "RoleType") RETURNS boolean
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM roles
    WHERE user_id = app_current_user_id()
      AND role_type = target_role_type
      AND valid_from <= now()
      AND (valid_to IS NULL OR valid_to > now())
  )
$$;

CREATE OR REPLACE FUNCTION app_actor_is_mentor_of(target_learner_id text) RETURNS boolean
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM mentor_assignments ma
    JOIN roles r ON r.id = ma.mentor_role_id
    WHERE r.user_id = app_current_user_id()
      AND ma.learner_user_id = target_learner_id
      AND ma.valid_to IS NULL
      AND r.valid_to IS NULL
  )
$$;

CREATE OR REPLACE FUNCTION app_actor_is_parent_of(target_learner_id text) RETURNS boolean
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM parent_links
    WHERE parent_user_id = app_current_user_id()
      AND minor_user_id = target_learner_id
      AND revoked_at IS NULL
  )
$$;

-- ============================================================================
-- IDENTITY MODULE -- opening write paths Phase 0 deliberately left closed
-- (Phase 0 shipped nothing user-facing; this slice's New Learner Onboarding
-- workflow is the first thing that actually needs to write these rows.)
-- ============================================================================

CREATE POLICY "roles_insert_administrator" ON "roles"
  FOR INSERT
  WITH CHECK (
    app_actor_has_active_role('ADMINISTRATOR')
    OR app_actor_has_active_role('FOUNDER')
  );
GRANT INSERT ON "roles" TO dgenie_app;

CREATE POLICY "parent_links_insert" ON "parent_links"
  FOR INSERT
  WITH CHECK (
    "parent_user_id" = app_current_user_id()
    OR app_actor_has_active_role('ADMINISTRATOR')
  );
GRANT INSERT ON "parent_links" TO dgenie_app;

-- ============================================================================
-- CURRICULUM MODULE -- reference content, not learner-owned. Readable by any
-- authenticated application connection; written only via a privileged seed
-- path (see prisma/seed.ts and the companion data-seed migration), the same
-- pattern Phase 0 used for AgentDefinition -- no Curriculum Architect
-- workflow exists in this slice's scope to write through the app role.
-- ============================================================================

ALTER TABLE "curriculum_domains" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "curriculum_domains" FORCE ROW LEVEL SECURITY;
CREATE POLICY "curriculum_domains_select_all" ON "curriculum_domains" FOR SELECT USING (true);
GRANT SELECT ON "curriculum_domains" TO dgenie_app;

ALTER TABLE "signature_experience_playbooks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "signature_experience_playbooks" FORCE ROW LEVEL SECURITY;
CREATE POLICY "signature_experience_playbooks_select_all" ON "signature_experience_playbooks" FOR SELECT USING (true);
GRANT SELECT ON "signature_experience_playbooks" TO dgenie_app;

ALTER TABLE "genius_level_rubrics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "genius_level_rubrics" FORCE ROW LEVEL SECURITY;
CREATE POLICY "genius_level_rubrics_select_all" ON "genius_level_rubrics" FOR SELECT USING (true);
GRANT SELECT ON "genius_level_rubrics" TO dgenie_app;

-- ============================================================================
-- LEARNING MODULE -- learner-owned; Architecture Spec Part Six: RLS on every
-- learner-owned table this phase creates, "deliberate redundancy," in
-- addition to the application-layer check the session state machine
-- (src/modules/learning/genius-cycle-session.ts) performs.
-- ============================================================================

ALTER TABLE "genius_cycle_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "genius_cycle_sessions" FORCE ROW LEVEL SECURITY;

CREATE POLICY "genius_cycle_sessions_select" ON "genius_cycle_sessions"
  FOR SELECT
  USING (
    "learner_user_id" = app_current_user_id()
    OR app_actor_is_mentor_of("learner_user_id")
  );

CREATE POLICY "genius_cycle_sessions_insert_own" ON "genius_cycle_sessions"
  FOR INSERT
  WITH CHECK ("learner_user_id" = app_current_user_id());

CREATE POLICY "genius_cycle_sessions_update_own" ON "genius_cycle_sessions"
  FOR UPDATE
  USING ("learner_user_id" = app_current_user_id())
  WITH CHECK ("learner_user_id" = app_current_user_id());

GRANT SELECT, INSERT, UPDATE ON "genius_cycle_sessions" TO dgenie_app;

-- ============================================================================
-- PORTFOLIO MODULE
-- ============================================================================

ALTER TABLE "portfolio_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "portfolio_entries" FORCE ROW LEVEL SECURITY;

CREATE POLICY "portfolio_entries_select" ON "portfolio_entries"
  FOR SELECT
  USING (
    "learner_user_id" = app_current_user_id()
    OR app_actor_is_mentor_of("learner_user_id")
    OR app_actor_is_parent_of("learner_user_id")
  );

-- A PortfolioEntry is normally written on the learner's own behalf (a
-- reflection, an artifact from their own completed session). The one
-- exception is entry_type = CERTIFIED_MILESTONE, written by the certifying
-- Mentor as part of Genius Level Certification (Architecture Spec Part Four:
-- "one certified milestone" is itself a PortfolioEntry kind) -- scoped the
-- same way Part Six describes an agent acting on a learner's behalf: never
-- beyond what that specific, named relationship (here, an active
-- MentorAssignment) actually covers.
CREATE POLICY "portfolio_entries_insert" ON "portfolio_entries"
  FOR INSERT
  WITH CHECK (
    "learner_user_id" = app_current_user_id()
    OR (
      app_actor_has_active_role('MENTOR')
      AND app_actor_is_mentor_of("learner_user_id")
    )
  );

GRANT SELECT, INSERT ON "portfolio_entries" TO dgenie_app;

ALTER TABLE "life_portfolio_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "life_portfolio_snapshots" FORCE ROW LEVEL SECURITY;

CREATE POLICY "life_portfolio_snapshots_select" ON "life_portfolio_snapshots"
  FOR SELECT
  USING (
    "learner_user_id" = app_current_user_id()
    OR app_actor_is_parent_of("learner_user_id")
  );

CREATE POLICY "life_portfolio_snapshots_insert_own" ON "life_portfolio_snapshots"
  FOR INSERT
  WITH CHECK ("learner_user_id" = app_current_user_id());

GRANT SELECT, INSERT ON "life_portfolio_snapshots" TO dgenie_app;

-- ============================================================================
-- ASSESSMENT MODULE -- the same enforcement pattern Phase 0 used for the
-- Audit Log's append-only property, applied here to CertificationRecord's
-- certifying-actor field per Architecture Spec Part Seven Workflow 4. See
-- the CertificationRecord model's own doc comment in schema.prisma for the
-- full two-layer explanation (schema-level FK shape + this policy).
-- ============================================================================

ALTER TABLE "certification_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "certification_records" FORCE ROW LEVEL SECURITY;

CREATE POLICY "certification_records_select" ON "certification_records"
  FOR SELECT
  USING (
    "learner_user_id" = app_current_user_id()
    OR "certified_by_user_id" = app_current_user_id()
    OR app_actor_is_mentor_of("learner_user_id")
    OR app_actor_is_parent_of("learner_user_id")
  );

CREATE POLICY "certification_records_insert_mentor" ON "certification_records"
  FOR INSERT
  WITH CHECK (
    "certified_by_user_id" = app_current_user_id()
    AND app_actor_has_active_role('MENTOR')
    AND app_actor_is_mentor_of("learner_user_id")
  );

-- No UPDATE or DELETE policy or grant exists for any role on this table --
-- deliberately, mirroring the Audit Log's append-only treatment. A
-- certification, once written, is not revised in place; Blueprint 04 Part
-- Four's own text treats a Genius Level as advancing, never retracted by
-- edit.
GRANT SELECT, INSERT ON "certification_records" TO dgenie_app;

ALTER TABLE "certification_record_evidence" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "certification_record_evidence" FORCE ROW LEVEL SECURITY;

CREATE POLICY "certification_record_evidence_select" ON "certification_record_evidence"
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM certification_records cr
      WHERE cr.id = certification_record_evidence.certification_record_id
        AND (
          cr.learner_user_id = app_current_user_id()
          OR cr.certified_by_user_id = app_current_user_id()
          OR app_actor_is_mentor_of(cr.learner_user_id)
          OR app_actor_is_parent_of(cr.learner_user_id)
        )
    )
  );

CREATE POLICY "certification_record_evidence_insert" ON "certification_record_evidence"
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM certification_records cr
      WHERE cr.id = certification_record_evidence.certification_record_id
        AND cr.certified_by_user_id = app_current_user_id()
    )
  );

GRANT SELECT, INSERT ON "certification_record_evidence" TO dgenie_app;

-- ============================================================================
-- MENTOR SESSION TRANSCRIPT (messaging skeleton)
-- Architecture Spec Part Four: "visible to the learner, the assigned
-- Mentor, and the Parent."
-- ============================================================================

ALTER TABLE "mentor_session_transcripts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mentor_session_transcripts" FORCE ROW LEVEL SECURITY;

CREATE POLICY "mentor_session_transcripts_select" ON "mentor_session_transcripts"
  FOR SELECT
  USING (
    "learner_user_id" = app_current_user_id()
    OR app_actor_is_mentor_of("learner_user_id")
    OR app_actor_is_parent_of("learner_user_id")
  );

CREATE POLICY "mentor_session_transcripts_insert" ON "mentor_session_transcripts"
  FOR INSERT
  WITH CHECK (
    app_actor_has_active_role('MENTOR')
    AND app_actor_is_mentor_of("learner_user_id")
  );

CREATE POLICY "mentor_session_transcripts_update" ON "mentor_session_transcripts"
  FOR UPDATE
  USING (app_actor_is_mentor_of("learner_user_id"))
  WITH CHECK (app_actor_is_mentor_of("learner_user_id"));

GRANT SELECT, INSERT, UPDATE ON "mentor_session_transcripts" TO dgenie_app;

-- ============================================================================
-- MENTOR ASSIGNMENT -- the Mentor caseload ceiling (Blueprint 11: twenty
-- learners, combined across both tracks) enforced at the database layer, not
-- only in application code (src/modules/identity/mentor-assignment.ts).
-- ============================================================================

ALTER TABLE "mentor_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mentor_assignments" FORCE ROW LEVEL SECURITY;

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
  );

-- The ceiling check: refuses the insert once the target Mentor Role already
-- holds twenty active assignments. Also confirms the target role is
-- genuinely an active MENTOR role, not merely a Role row of some other type
-- -- both checks belong here, at the point of insert, per this prompt's own
-- "enforce this as a hard check at the point Workflow 1 assigns a Mentor."
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
    ) < 20
  );

GRANT SELECT, INSERT ON "mentor_assignments" TO dgenie_app;

-- ============================================================================
-- GENIE MEMORY -- Blueprint 08 Part Four Section Nine: "AI Memory | Learner,
-- as the Genie's primary owner." No live pipeline reads or writes this table
-- in this slice (see the GenieMemory model's own doc comment); the row is
-- created empty at onboarding by an Administrator.
-- ============================================================================

ALTER TABLE "genie_memories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "genie_memories" FORCE ROW LEVEL SECURITY;

CREATE POLICY "genie_memories_select_own" ON "genie_memories"
  FOR SELECT
  USING ("learner_user_id" = app_current_user_id());

CREATE POLICY "genie_memories_insert_administrator" ON "genie_memories"
  FOR INSERT
  WITH CHECK (app_actor_has_active_role('ADMINISTRATOR'));

GRANT SELECT, INSERT ON "genie_memories" TO dgenie_app;
