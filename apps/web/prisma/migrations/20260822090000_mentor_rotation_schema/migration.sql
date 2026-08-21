-- Mentor five-year rotation + same-faith Mentor matching -- Blueprint 11
-- Section Four, Blueprint 07 Parts Two and Five, Blueprint 12 Section Five.
-- See schema.prisma's own doc comments on FaithBackground, User.
-- faithBackgroundPreference, Role.mentorFaithBackground, and MentorHandoff
-- for the full citations. Applied via the Supabase MCP `apply_migration`
-- tool, same reason as every prior phase: this build environment has no
-- network path to the Supabase project.

CREATE TYPE "FaithBackground" AS ENUM ('CHRISTIAN');

ALTER TABLE "users" ADD COLUMN "faith_background_preference" "FaithBackground";
ALTER TABLE "roles" ADD COLUMN "mentor_faith_background" "FaithBackground";

CREATE TABLE "mentor_handoffs" (
    "id" TEXT NOT NULL,
    "learner_user_id" TEXT NOT NULL,
    "outgoing_mentor_role_id" TEXT NOT NULL,
    "incoming_mentor_role_id" TEXT NOT NULL,
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "carry_forward_notes" TEXT,
    "in_progress_notes" TEXT,
    "expectations_for_learner" TEXT,
    "family_included" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mentor_handoffs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "mentor_handoffs_learner_user_id_idx" ON "mentor_handoffs"("learner_user_id");

ALTER TABLE "mentor_handoffs" ADD CONSTRAINT "mentor_handoffs_learner_user_id_fkey" FOREIGN KEY ("learner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mentor_handoffs" ADD CONSTRAINT "mentor_handoffs_outgoing_mentor_role_id_fkey" FOREIGN KEY ("outgoing_mentor_role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mentor_handoffs" ADD CONSTRAINT "mentor_handoffs_incoming_mentor_role_id_fkey" FOREIGN KEY ("incoming_mentor_role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- New AuditEventType values -- mentor-rotation.ts and mentor-handoff.ts's
-- own audit trail entries, distinct from the generic ROLE_GRANTED/
-- MENTOR_ASSIGNED kinds so a rotation, a renewal, and a handoff's own
-- schedule/completion steps are each findable as their own event kind, the
-- same granularity every prior phase's workflow-specific audit entries use.
ALTER TYPE "AuditEventType" ADD VALUE 'MENTOR_ROTATED';
ALTER TYPE "AuditEventType" ADD VALUE 'MENTOR_HANDOFF_SCHEDULED';
ALTER TYPE "AuditEventType" ADD VALUE 'MENTOR_HANDOFF_COMPLETED';
