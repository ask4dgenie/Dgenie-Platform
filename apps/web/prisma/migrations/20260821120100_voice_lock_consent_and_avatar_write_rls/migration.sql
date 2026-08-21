-- Row-Level Security for verifiable_parental_consents, and the new write
-- paths this task adds to avatar_configurations (voice-lock-activation.ts,
-- voice-data-retention.ts). Architecture Spec Part Six's "two layers, not
-- one" -- the same pattern every prior phase's new table, and every new
-- write path on an existing table, has followed.

-- ============================================================================
-- VERIFIABLE_PARENTAL_CONSENTS -- append-only, the same pattern
-- audit_log_entries already established (20260817120100_phase0_rls_and_
-- audit_grants). Insert scoped to the consenting parent's own household,
-- reusing app_actor_is_parent_of (20260818090100_phase1_slice_a_rls_and_
-- grants); no UPDATE or DELETE grant exists for dgenie_app at all -- a
-- consent record, once given, is never edited, only superseded by a later
-- row if a family re-consents. SELECT is scoped the same way the INSERT is
-- (a parent may read back their own household's consent history) --
-- verifiable-parental-consent.ts's own RLS session runs as the consenting
-- parent throughout, and voice-lock-activation.ts's consent check
-- (`hasVerifiedVoiceLockConsent`) also runs in that same parent-scoped
-- session, so without this SELECT policy that check would see nothing and
-- the write-once lock could never legitimately activate at all.
-- ============================================================================

ALTER TABLE "verifiable_parental_consents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "verifiable_parental_consents" FORCE ROW LEVEL SECURITY;

CREATE POLICY "verifiable_parental_consents_select_parent" ON "verifiable_parental_consents"
  FOR SELECT
  USING (app_actor_is_parent_of("learner_user_id"));

CREATE POLICY "verifiable_parental_consents_insert_parent" ON "verifiable_parental_consents"
  FOR INSERT
  WITH CHECK (
    "parent_user_id" = app_current_user_id()
    AND app_actor_is_parent_of("learner_user_id")
  );

GRANT SELECT, INSERT ON "verifiable_parental_consents" TO dgenie_app;
REVOKE UPDATE, DELETE ON "verifiable_parental_consents" FROM dgenie_app;
REVOKE UPDATE, DELETE ON "verifiable_parental_consents" FROM PUBLIC;

-- ============================================================================
-- AVATAR_CONFIGURATIONS -- new write paths. The prior migration
-- (20260821090100_avatar_configurations_rls, PR#4) granted only SELECT,
-- deliberately, because "this task builds no code path that creates or
-- writes an AvatarConfiguration row at all... When the thirteen-plus
-- pipeline slice is built, it adds the specific, narrow write policy
-- voice_id's write-once guarantee needs (e.g. an INSERT-only policy plus a
-- trigger or check refusing any UPDATE that changes an already-non-null
-- voice_id) alongside the code that actually calls it -- not before, and
-- not here." This migration is that code's own policy.
--
-- INSERT is the only way `voice_id` is ever set to a non-null value --
-- voice-lock-activation.ts's `activateVoiceLock` always `create()`s this
-- row, never `update()`s one, so `learner_user_id`'s own `@unique`
-- constraint (from the very first avatar_configurations migration) is what
-- makes a second activation attempt fail at the database layer even if an
-- application-layer race let it past the app-layer pre-check -- see
-- voice-lock-activation.test.ts's own "database-layer backstop" test for
-- the property this is meant to guarantee.
--
-- The one UPDATE this migration grants is scoped two ways at once: only an
-- Administrator-acting session may issue it at all (USING), and the
-- resulting row must have voice_id back to null (WITH CHECK) -- an UPDATE
-- can only ever clear this column, never set or change it to a different
-- non-null value. That is voice-data-retention.ts's own destruction path
-- (`destroyThirteenPlusTierVoiceDataForLearner`), and nothing else this
-- schema permits.
-- ============================================================================

CREATE POLICY "avatar_configurations_select_parent" ON "avatar_configurations"
  FOR SELECT
  USING (app_actor_is_parent_of("learner_user_id"));

CREATE POLICY "avatar_configurations_insert_parent_voice_lock" ON "avatar_configurations"
  FOR INSERT
  WITH CHECK (app_actor_is_parent_of("learner_user_id"));

CREATE POLICY "avatar_configurations_update_destroy_administrator" ON "avatar_configurations"
  FOR UPDATE
  USING (app_actor_has_active_role('ADMINISTRATOR'))
  WITH CHECK (
    app_actor_has_active_role('ADMINISTRATOR')
    AND "voice_id" IS NULL
    AND "voice_id_set_at" IS NULL
  );

GRANT INSERT, UPDATE ON "avatar_configurations" TO dgenie_app;
REVOKE DELETE ON "avatar_configurations" FROM dgenie_app;
REVOKE DELETE ON "avatar_configurations" FROM PUBLIC;
