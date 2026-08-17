-- Phase 1, Slice A -- schema DDL.
-- Mirrors ../../schema.prisma exactly. See that file's per-model doc
-- comments for the Architecture Spec Part / Blueprint 04 Part citation
-- behind each table. Applied the same way Phase 0's migrations were: via
-- the Supabase MCP `apply_migration` tool rather than `prisma migrate
-- deploy` directly, because this build environment still has no network
-- path to the Supabase project -- see the Phase 1 Slice A PR description.

-- ============================================================================
-- IDENTITY MODULE -- extensions (Track, circle placeholder)
-- ============================================================================

CREATE TYPE "Track" AS ENUM ('HOME', 'MEMBERSHIP');

ALTER TABLE "users" ADD COLUMN "track" "Track";
ALTER TABLE "users" ADD COLUMN "circle_id" TEXT;

-- ============================================================================
-- CURRICULUM MODULE -- Architecture Spec Part Four
-- ============================================================================

CREATE TYPE "CurriculumDomainCode" AS ENUM (
    'SPIRITUAL_FORMATION',
    'INTELLECTUAL_FORMATION',
    'LANGUAGE_AND_COMMUNICATION',
    'CREATIVE_FORMATION',
    'LEADERSHIP_AND_SOCIETY',
    'TECHNOLOGY_AND_INNOVATION',
    'PHYSICAL_FORMATION',
    'EMOTIONAL_AND_SOCIAL_FORMATION',
    'GENIUS_DEVELOPMENT'
);

CREATE TABLE "curriculum_domains" (
    "id" TEXT NOT NULL,
    "code" "CurriculumDomainCode" NOT NULL,
    "locale" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "curriculum_domains_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "curriculum_domains_code_locale_key" ON "curriculum_domains"("code", "locale");

CREATE TYPE "SignatureExperienceType" AS ENUM (
    'DISCOVERY_PROJECT',
    'BUILDER_PROJECT',
    'INNOVATION_PROJECT',
    'STORY_PROJECT',
    'KINGDOM_PROJECT'
);

CREATE TABLE "signature_experience_playbooks" (
    "id" TEXT NOT NULL,
    "curriculum_domain_id" TEXT NOT NULL,
    "type" "SignatureExperienceType" NOT NULL,
    "locale" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "structure" TEXT NOT NULL,
    "evidence_standard" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "signature_experience_playbooks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "signature_experience_playbooks_domain_type_locale_key" ON "signature_experience_playbooks"("curriculum_domain_id", "type", "locale");
ALTER TABLE "signature_experience_playbooks" ADD CONSTRAINT "signature_experience_playbooks_curriculum_domain_id_fkey" FOREIGN KEY ("curriculum_domain_id") REFERENCES "curriculum_domains"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- LEARNING MODULE -- Architecture Spec Part Four; Blueprint 04 Parts Six, Fourteen
-- ============================================================================

CREATE TYPE "GeniusCycleMovement" AS ENUM (
    'GENIE_CHECK_IN',
    'AWAKEN',
    'THINK',
    'CREATE',
    'LEAD_AND_SERVE',
    'BUILD',
    'REFLECT',
    'GENIE_CHECK_OUT'
);

CREATE TYPE "GeniusCycleSessionStatus" AS ENUM (
    'IN_PROGRESS',
    'COMPLETED',
    'ABANDONED',
    'IN_RECOVERY_CYCLE',
    'RECOVERY_COMPLETED'
);

CREATE TYPE "RecoveryCycleStep" AS ENUM (
    'TRY',
    'FAIL',
    'REFLECT',
    'RECOVER',
    'REORIENT',
    'TRY_AGAIN'
);

CREATE TABLE "genius_cycle_sessions" (
    "id" TEXT NOT NULL,
    "learner_user_id" TEXT NOT NULL,
    "curriculum_domain_id" TEXT NOT NULL,
    "status" "GeniusCycleSessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "current_movement" "GeniusCycleMovement" NOT NULL DEFAULT 'GENIE_CHECK_IN',
    "recovery_cycle_step" "RecoveryCycleStep",
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "abandoned_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "genius_cycle_sessions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "genius_cycle_sessions_learner_user_id_status_idx" ON "genius_cycle_sessions"("learner_user_id", "status");
ALTER TABLE "genius_cycle_sessions" ADD CONSTRAINT "genius_cycle_sessions_learner_user_id_fkey" FOREIGN KEY ("learner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "genius_cycle_sessions" ADD CONSTRAINT "genius_cycle_sessions_curriculum_domain_id_fkey" FOREIGN KEY ("curriculum_domain_id") REFERENCES "curriculum_domains"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- PORTFOLIO MODULE -- Architecture Spec Part Four
-- ============================================================================

CREATE TYPE "PortfolioEntryType" AS ENUM (
    'REFLECTION',
    'ARTIFACT',
    'CERTIFIED_MILESTONE',
    'RECOVERY_CYCLE_RECORD'
);

CREATE TABLE "portfolio_entries" (
    "id" TEXT NOT NULL,
    "learner_user_id" TEXT NOT NULL,
    "entry_type" "PortfolioEntryType" NOT NULL,
    "curriculum_domain_id" TEXT,
    "genius_cycle_session_id" TEXT,
    "title" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portfolio_entries_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "portfolio_entries_learner_user_id_idx" ON "portfolio_entries"("learner_user_id");
CREATE INDEX "portfolio_entries_entry_type_idx" ON "portfolio_entries"("entry_type");
ALTER TABLE "portfolio_entries" ADD CONSTRAINT "portfolio_entries_learner_user_id_fkey" FOREIGN KEY ("learner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "portfolio_entries" ADD CONSTRAINT "portfolio_entries_curriculum_domain_id_fkey" FOREIGN KEY ("curriculum_domain_id") REFERENCES "curriculum_domains"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "portfolio_entries" ADD CONSTRAINT "portfolio_entries_genius_cycle_session_id_fkey" FOREIGN KEY ("genius_cycle_session_id") REFERENCES "genius_cycle_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "life_portfolio_snapshots" (
    "id" TEXT NOT NULL,
    "learner_user_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content" JSONB NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "life_portfolio_snapshots_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "life_portfolio_snapshots_learner_user_id_version_key" ON "life_portfolio_snapshots"("learner_user_id", "version");
ALTER TABLE "life_portfolio_snapshots" ADD CONSTRAINT "life_portfolio_snapshots_learner_user_id_fkey" FOREIGN KEY ("learner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- ASSESSMENT MODULE -- Architecture Spec Part Four; Part Seven Workflow 4
-- ============================================================================

CREATE TYPE "GeniusLevelChapter" AS ENUM ('DISCOVERY', 'FOUNDATION', 'MASTERY', 'LEGACY');
CREATE TYPE "RubricTier" AS ENUM ('EMERGING', 'DEVELOPING', 'PROFICIENT', 'EXEMPLARY');

CREATE TABLE "genius_level_rubrics" (
    "id" TEXT NOT NULL,
    "curriculum_domain_id" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "chapter" "GeniusLevelChapter" NOT NULL,
    "level_name" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "evidence_standard" TEXT NOT NULL,
    "minimum_tier" "RubricTier" NOT NULL DEFAULT 'PROFICIENT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "genius_level_rubrics_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "genius_level_rubrics_domain_level_locale_key" ON "genius_level_rubrics"("curriculum_domain_id", "level", "locale");
ALTER TABLE "genius_level_rubrics" ADD CONSTRAINT "genius_level_rubrics_curriculum_domain_id_fkey" FOREIGN KEY ("curriculum_domain_id") REFERENCES "curriculum_domains"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "certification_records" (
    "id" TEXT NOT NULL,
    "learner_user_id" TEXT NOT NULL,
    "genius_level_rubric_id" TEXT NOT NULL,
    "certified_by_user_id" TEXT NOT NULL,
    "certified_by_role_id" TEXT NOT NULL,
    "certified_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certification_records_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "certification_records_learner_user_id_idx" ON "certification_records"("learner_user_id");
ALTER TABLE "certification_records" ADD CONSTRAINT "certification_records_learner_user_id_fkey" FOREIGN KEY ("learner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "certification_records" ADD CONSTRAINT "certification_records_genius_level_rubric_id_fkey" FOREIGN KEY ("genius_level_rubric_id") REFERENCES "genius_level_rubrics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "certification_records" ADD CONSTRAINT "certification_records_certified_by_user_id_fkey" FOREIGN KEY ("certified_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "certification_records" ADD CONSTRAINT "certification_records_certified_by_role_id_fkey" FOREIGN KEY ("certified_by_role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "certification_record_evidence" (
    "id" TEXT NOT NULL,
    "certification_record_id" TEXT NOT NULL,
    "portfolio_entry_id" TEXT NOT NULL,

    CONSTRAINT "certification_record_evidence_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "certification_record_evidence_record_entry_key" ON "certification_record_evidence"("certification_record_id", "portfolio_entry_id");
ALTER TABLE "certification_record_evidence" ADD CONSTRAINT "certification_record_evidence_certification_record_id_fkey" FOREIGN KEY ("certification_record_id") REFERENCES "certification_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "certification_record_evidence" ADD CONSTRAINT "certification_record_evidence_portfolio_entry_id_fkey" FOREIGN KEY ("portfolio_entry_id") REFERENCES "portfolio_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- MENTOR SESSION TRANSCRIPT (messaging skeleton) + MENTOR ASSIGNMENT
-- Architecture Spec Part Four; Part Seven Workflows 1 and 3; Blueprint 11
-- ============================================================================

CREATE TYPE "MentorSessionStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'MISSED', 'CANCELLED');

CREATE TABLE "mentor_session_transcripts" (
    "id" TEXT NOT NULL,
    "learner_user_id" TEXT NOT NULL,
    "mentor_role_id" TEXT NOT NULL,
    "status" "MentorSessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduled_for" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "duration_minutes" INTEGER,
    "transcript_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mentor_session_transcripts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "mentor_session_transcripts_learner_user_id_idx" ON "mentor_session_transcripts"("learner_user_id");
CREATE INDEX "mentor_session_transcripts_mentor_role_id_idx" ON "mentor_session_transcripts"("mentor_role_id");
ALTER TABLE "mentor_session_transcripts" ADD CONSTRAINT "mentor_session_transcripts_learner_user_id_fkey" FOREIGN KEY ("learner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mentor_session_transcripts" ADD CONSTRAINT "mentor_session_transcripts_mentor_role_id_fkey" FOREIGN KEY ("mentor_role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "mentor_assignments" (
    "id" TEXT NOT NULL,
    "learner_user_id" TEXT NOT NULL,
    "mentor_role_id" TEXT NOT NULL,
    "assigned_by_user_id" TEXT,
    "valid_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_to" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mentor_assignments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "mentor_assignments_learner_user_id_valid_to_idx" ON "mentor_assignments"("learner_user_id", "valid_to");
CREATE INDEX "mentor_assignments_mentor_role_id_valid_to_idx" ON "mentor_assignments"("mentor_role_id", "valid_to");
ALTER TABLE "mentor_assignments" ADD CONSTRAINT "mentor_assignments_learner_user_id_fkey" FOREIGN KEY ("learner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mentor_assignments" ADD CONSTRAINT "mentor_assignments_mentor_role_id_fkey" FOREIGN KEY ("mentor_role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mentor_assignments" ADD CONSTRAINT "mentor_assignments_assigned_by_user_id_fkey" FOREIGN KEY ("assigned_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================================
-- AI GATEWAY MODULE -- GenieMemory (Phase 1 data-model extension)
-- ============================================================================

CREATE TABLE "genie_memories" (
    "id" TEXT NOT NULL,
    "learner_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "genie_memories_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "genie_memories_learner_user_id_key" ON "genie_memories"("learner_user_id");
ALTER TABLE "genie_memories" ADD CONSTRAINT "genie_memories_learner_user_id_fkey" FOREIGN KEY ("learner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================
-- AUDIT LOG -- new event type
-- ============================================================================

ALTER TYPE "AuditEventType" ADD VALUE 'MENTOR_ASSIGNED';
