-- Row-Level Security for avatar_configurations, per Architecture Spec Part
-- Six's "two layers, not one" -- the same pattern every prior phase's new
-- table has followed.
--
-- No INSERT, UPDATE, or DELETE grant exists for `dgenie_app` on this table.
-- This is deliberate, not an oversight: this task builds no code path that
-- creates or writes an AvatarConfiguration row at all (the Reveal flow that
-- would is real thirteen-plus-tier pipeline work, out of this task's scope
-- per its own non-goals). Granting a write path now, with nothing in this
-- codebase yet exercising or testing it, would be unverified plumbing
-- rather than the "gating and scaffolding" this task actually asks for.
-- When the thirteen-plus pipeline slice is built, it adds the specific,
-- narrow write policy `voice_id`'s write-once guarantee needs (e.g. an
-- INSERT-only policy plus a trigger or check refusing any UPDATE that
-- changes an already-non-null `voice_id`) alongside the code that actually
-- calls it -- not before, and not here.

ALTER TABLE "avatar_configurations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "avatar_configurations" FORCE ROW LEVEL SECURITY;

-- Learner-owned, narrow visibility -- the same treatment `genie_memories`
-- already has (Blueprint 08 Part Four Section Nine: "AI Memory | Learner,
-- as the Genie's primary owner").
CREATE POLICY "avatar_configurations_select_own" ON "avatar_configurations"
  FOR SELECT
  USING ("learner_user_id" = app_current_user_id());

GRANT SELECT ON "avatar_configurations" TO dgenie_app;
