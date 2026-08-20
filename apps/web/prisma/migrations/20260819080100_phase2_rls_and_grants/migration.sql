-- Phase 2 -- Row-Level Security policies and grants for every table created
-- in the companion 20260819080000_phase2_community_messaging_events_schema
-- migration, per Architecture Spec Part Six's "two layers, not one" and
-- this phase's own instruction to follow the established RLS pattern
-- exactly. See apps/web/src/lib/db/rls.ts for the application-side half
-- (unchanged since Phase 0).

-- ============================================================================
-- NEW SESSION-CONTEXT HELPERS
--
-- Two more, for the same reason Phase 1 Slice A added its own three:
-- Architecture Spec Part Six's dynamic-role-resolution principle now has to
-- answer "is the acting session an active member of Circle X" and "...of
-- any Circle within Region Y." Both are self-referential from the caller's
-- own perspective (they only ever check the caller's own membership rows),
-- which is why they work correctly even though circle_memberships itself
-- carries a conservative, own-row-only SELECT policy below -- a caller can
-- always see whether *they* belong somewhere, without that requiring a
-- broadly readable membership roster.
-- ============================================================================

CREATE OR REPLACE FUNCTION app_actor_is_circle_member_of(target_circle_id text) RETURNS boolean
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM circle_memberships
    WHERE user_id = app_current_user_id()
      AND circle_id = target_circle_id
      AND left_at IS NULL
  )
$$;

CREATE OR REPLACE FUNCTION app_actor_is_region_member_of(target_region_id text) RETURNS boolean
LANGUAGE sql STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM circle_memberships cm
    JOIN circles c ON c.id = cm.circle_id
    WHERE cm.user_id = app_current_user_id()
      AND c.region_id = target_region_id
      AND cm.left_at IS NULL
  )
$$;

-- ============================================================================
-- COMMUNITY MODULE
-- national_communities / regions / circles are community-directory
-- structure, not personal records -- readable by any authenticated
-- connection, the same treatment Phase 0/1 gave reference content
-- (AgentDefinition, CurriculumDomain). Written only via a privileged seed
-- path (see the companion seed migration) -- this phase's workflows assign
-- an existing Circle, they do not create new ones.
-- ============================================================================

ALTER TABLE "national_communities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "national_communities" FORCE ROW LEVEL SECURITY;
CREATE POLICY "national_communities_select_all" ON "national_communities" FOR SELECT USING (true);
GRANT SELECT ON "national_communities" TO dgenie_app;

ALTER TABLE "regions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "regions" FORCE ROW LEVEL SECURITY;
CREATE POLICY "regions_select_all" ON "regions" FOR SELECT USING (true);
GRANT SELECT ON "regions" TO dgenie_app;

ALTER TABLE "circles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "circles" FORCE ROW LEVEL SECURITY;
CREATE POLICY "circles_select_all" ON "circles" FOR SELECT USING (true);
GRANT SELECT ON "circles" TO dgenie_app;

-- circle_memberships carries real information about which specific family
-- belongs to which real-world, geographically local group -- a
-- safeguarding-relevant fact about a minor's real-world location pattern,
-- not mere community-directory content. Kept conservative: a member sees
-- only their own row; only an Administrator sees the full picture. This is
-- deliberately narrower than "any fellow Circle member can see the whole
-- roster" -- that broader visibility is a real, plausible product decision,
-- but not one this phase's governance sources ask for, so it is not
-- defaulted into.
ALTER TABLE "circle_memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "circle_memberships" FORCE ROW LEVEL SECURITY;

CREATE POLICY "circle_memberships_select" ON "circle_memberships"
  FOR SELECT
  USING (
    "user_id" = app_current_user_id()
    OR app_actor_has_active_role('ADMINISTRATOR')
  );

CREATE POLICY "circle_memberships_insert_administrator" ON "circle_memberships"
  FOR INSERT
  WITH CHECK (app_actor_has_active_role('ADMINISTRATOR'));

GRANT SELECT, INSERT ON "circle_memberships" TO dgenie_app;

-- ============================================================================
-- MESSAGING MODULE -- remainder
-- ============================================================================

ALTER TABLE "direct_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "direct_messages" FORCE ROW LEVEL SECURITY;

CREATE POLICY "direct_messages_select" ON "direct_messages"
  FOR SELECT
  USING (
    "sender_user_id" = app_current_user_id()
    OR "recipient_user_id" = app_current_user_id()
  );

CREATE POLICY "direct_messages_insert_own" ON "direct_messages"
  FOR INSERT
  WITH CHECK ("sender_user_id" = app_current_user_id());

-- Recipient-only update, in practice used just to set `read_at` --
-- application code is what actually restricts which column changes; RLS
-- restricts which rows may be touched at all, per this table's own
-- two-layer discipline.
CREATE POLICY "direct_messages_update_recipient" ON "direct_messages"
  FOR UPDATE
  USING ("recipient_user_id" = app_current_user_id())
  WITH CHECK ("recipient_user_id" = app_current_user_id());

GRANT SELECT, INSERT, UPDATE ON "direct_messages" TO dgenie_app;

ALTER TABLE "circle_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "circle_messages" FORCE ROW LEVEL SECURITY;

CREATE POLICY "circle_messages_select" ON "circle_messages"
  FOR SELECT
  USING (
    app_actor_is_circle_member_of("circle_id")
    OR "author_user_id" = app_current_user_id()
    OR app_actor_has_active_role('ADMINISTRATOR')
  );

CREATE POLICY "circle_messages_insert" ON "circle_messages"
  FOR INSERT
  WITH CHECK (
    "author_user_id" = app_current_user_id()
    AND app_actor_is_circle_member_of("circle_id")
  );

GRANT SELECT, INSERT ON "circle_messages" TO dgenie_app;

-- ============================================================================
-- EVENTS MODULE
-- ============================================================================

ALTER TABLE "morning_sparks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "morning_sparks" FORCE ROW LEVEL SECURITY;

CREATE POLICY "morning_sparks_select_all" ON "morning_sparks" FOR SELECT USING (true);

CREATE POLICY "morning_sparks_insert_administrator" ON "morning_sparks"
  FOR INSERT
  WITH CHECK (
    "authored_by_user_id" = app_current_user_id()
    AND app_actor_has_active_role('ADMINISTRATOR')
  );

GRANT SELECT, INSERT ON "morning_sparks" TO dgenie_app;

ALTER TABLE "circle_times" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "circle_times" FORCE ROW LEVEL SECURITY;

CREATE POLICY "circle_times_select" ON "circle_times"
  FOR SELECT
  USING (
    app_actor_is_circle_member_of("circle_id")
    OR app_actor_has_active_role('ADMINISTRATOR')
  );

CREATE POLICY "circle_times_insert_administrator" ON "circle_times"
  FOR INSERT
  WITH CHECK (app_actor_has_active_role('ADMINISTRATOR'));

CREATE POLICY "circle_times_update_administrator" ON "circle_times"
  FOR UPDATE
  USING (app_actor_has_active_role('ADMINISTRATOR'))
  WITH CHECK (app_actor_has_active_role('ADMINISTRATOR'));

GRANT SELECT, INSERT, UPDATE ON "circle_times" TO dgenie_app;

ALTER TABLE "gatherings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gatherings" FORCE ROW LEVEL SECURITY;

CREATE POLICY "gatherings_select" ON "gatherings"
  FOR SELECT
  USING (
    app_actor_is_region_member_of("region_id")
    OR app_actor_has_active_role('ADMINISTRATOR')
  );

CREATE POLICY "gatherings_insert_administrator" ON "gatherings"
  FOR INSERT
  WITH CHECK (app_actor_has_active_role('ADMINISTRATOR'));

CREATE POLICY "gatherings_update_administrator" ON "gatherings"
  FOR UPDATE
  USING (app_actor_has_active_role('ADMINISTRATOR'))
  WITH CHECK (app_actor_has_active_role('ADMINISTRATOR'));

GRANT SELECT, INSERT, UPDATE ON "gatherings" TO dgenie_app;

-- recognition_nights: visible to the honoree, their Parent, their assigned
-- Mentor, and their Circle's own membership (Blueprint 06's "community-wide
-- moment," read here as community-wide at the Circle's own scale, not
-- exposed platform-wide to strangers -- see the model's own doc comment in
-- schema.prisma). Written only by a Mentor, Community Mentor, or
-- Administrator, per Blueprint 08 Part Four Section Eight's Monthly Review
-- workflow row ("Mentor, Parent, Community Mentor" -- Parent is informed,
-- not a writer here).
ALTER TABLE "recognition_nights" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "recognition_nights" FORCE ROW LEVEL SECURITY;

CREATE POLICY "recognition_nights_select" ON "recognition_nights"
  FOR SELECT
  USING (
    "learner_user_id" = app_current_user_id()
    OR app_actor_is_parent_of("learner_user_id")
    OR app_actor_is_mentor_of("learner_user_id")
    OR app_actor_is_circle_member_of("circle_id")
  );

CREATE POLICY "recognition_nights_insert" ON "recognition_nights"
  FOR INSERT
  WITH CHECK (
    "recognized_by_user_id" = app_current_user_id()
    AND (
      app_actor_has_active_role('MENTOR')
      OR app_actor_has_active_role('COMMUNITY_MENTOR')
      OR app_actor_has_active_role('ADMINISTRATOR')
    )
  );

GRANT SELECT, INSERT ON "recognition_nights" TO dgenie_app;
